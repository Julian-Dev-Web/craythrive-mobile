/* global __dirname */
/* Run with: node scripts/check-marketplace.cjs
 * Read-only checks: no network, database writes, bundles, or APK builds.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");
const parser = require("@babel/parser");
const babel = require("@babel/core");
const { ESLint } = require("eslint");
const rootDir = path.resolve(__dirname, "..");
process.chdir(rootDir);
const marketFile = "src/screens/main/MarketplaceScreen.js";
const detailsFile = "src/screens/main/MarketplaceProductDetailsScreen.js";
const addFile = "src/screens/main/AddMarketplaceListingScreen.js";
const chatFile = "src/screens/main/MarketplaceChatScreen.js";
const sellerFile = "src/screens/main/settings/SellerProfileScreen.js";
const helperFile = "src/lib/marketplace.js";
const files = [marketFile, detailsFile, addFile, chatFile, sellerFile, helperFile,
  "src/screens/main/SettingsScreen.js", "app/index.tsx", "src/lib/supabase.js",
  "src/context/ThemeContext.js", "app/_layout.tsx"];
const sources = new Map();
const asts = new Map();
const parse = (source, file) => parser.parse(source, {
  sourceType: "module", plugins: /\.tsx?$/.test(file) ? ["jsx", "typescript"] : ["jsx"],
});
function source(file) {
  if (!sources.has(file)) sources.set(file, fs.readFileSync(file, "utf8"));
  return sources.get(file);
}
function ast(file) {
  if (!asts.has(file)) asts.set(file, parse(source(file), file));
  return asts.get(file);
}
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "extra"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}
function rootFunction(file) {
  return ast(file).program.body.find(node => node.type === "ExportDefaultDeclaration").declaration;
}
function extract(file, names, context = {}) {
  const nodes = [...ast(file).program.body, ...(rootFunction(file)?.body?.body || [])];
  const found = names.map(name => {
    const node = nodes.find(item => item.type === "FunctionDeclaration" && item.id.name === name ||
      item.type === "VariableDeclaration" && item.declarations.some(decl => decl.id.name === name));
    assert.ok(node, "Missing function or constant: " + name);
    return source(file).slice(node.start, node.end);
  });
  const sandbox = vm.createContext({ console: { log() {} }, URL, ...context });
  vm.runInContext(found.join("\n"), sandbox);
  return sandbox;
}
function loadCommonJS(file, requireMock) {
  const { code } = babel.transformSync(source(file), {
    filename: path.resolve(file), configFile: false, babelrc: false,
    plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: requireMock, URL, console, setTimeout, clearTimeout });
  return exports;
}
function mockClient(options = {}) {
  const calls = [];
  const user = options.userId === null ? null : { id: options.userId || "buyer" };
  let listing = Object.hasOwn(options, "listing") ? options.listing :
    { id: "listing", seller_id: "seller", status: "active", quantity: 5, price: 120, unit: "pack" };
  const client = {
    calls, auth: { getUser: async () => ({ data: { user }, error: options.authError || null }) },
    from(table) {
      const call = { table, operation: "select", filters: [] };
      let recorded = false;
      function result() {
        if (!recorded) { calls.push(call); recorded = true; }
        if (table === "seller_profiles") return { data: options.seller || sellerFixture, error: options.sellerError || null };
        if (table === "marketplace_listings" && call.operation === "select") {
          return { data: listing, error: options.listingError || null };
        }
        if (table === "marketplace_orders" && call.operation === "select") {
          return { data: options.existingOrder || null, error: null };
        }
        if (table === "marketplace_orders" && call.operation === "insert") return { error: options.orderError || null };
        if (call.operation === "update" && table === "marketplace_listings") {
          if (options.statusThrows) throw new Error("Network failed after saving the order");
          if (!options.statusError && !options.noStatusChange) listing = { ...listing, ...call.payload };
        }
        if (call.operation === "update") return {
          data: options.updateData === null ? null : call.table === "marketplace_orders"
            ? { id: "order", listing_id: "listing", buyer_id: "buyer", status: "cancelled" } : listing,
          error: options.statusError || null,
        };
        return { data: null, error: null };
      }
      const query = {
        select() { return query; },
        limit() { return query; },
        eq(column, value) { call.filters.push(["eq", column, value]); return query; },
        in(column, value) { call.filters.push(["in", column, value]); return query; },
        insert(payload) { call.operation = "insert"; call.payload = payload; return query; },
        upsert(payload, settings) { call.operation = "upsert"; call.payload = payload; call.settings = settings; return query; },
        update(payload) { call.operation = "update"; call.payload = payload; return query; },
        maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  return client;
}
const sellerFixture = {
  user_id: "buyer", store_name: "Store", store_description: "Description", seller_mobile: "09123456789",
  pickup_municipality: "Malolos", pickup_municipality_code: "0314100000",
  pickup_barangay: "Atlag", pickup_barangay_code: "0314100010", pickup_note: "Gate",
  shopee_url: "https://shopee.ph/store", lazada_url: "https://lazada.com.ph/store",
  facebook_url: "https://facebook.com/store", tiktok_url: "https://tiktok.com/@store",
  website_url: "https://example.com", is_active: true,
};
let behaviorChecks = 0;
async function check(label, fn) {
  await fn();
  behaviorChecks++;
  console.log("PASS " + label);
}
function resolvePackage(specifier, fromFile) {
  const paths = [path.dirname(path.resolve(fromFile))];
  let failure;
  for (const suffix of ["", ".ts", ".tsx", ".native.js", "/index.ts", "/index.tsx"]) {
    try { return require.resolve(specifier + suffix, { paths }); }
    catch (error) { failure ||= error; }
  }
  throw failure;
}

async function main() {
  const expoPreset = require.resolve("babel-preset-expo", {
    paths: [path.dirname(require.resolve("expo/package.json"))],
  });
  const icons = JSON.parse(fs.readFileSync(
    require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json"), "utf8"));
  for (const file of files) {
    const tree = ast(file);
    for (const item of tree.program.body.filter(node => node.type === "ImportDeclaration")) {
      const specifier = item.source.value;
      if (!specifier.startsWith(".")) {
        resolvePackage(specifier, file);
        continue;
      }
      const base = path.resolve(path.dirname(file), specifier);
      const target = [base, ...[".js", ".jsx", ".ts", ".tsx", ".json", "/index.js", "/index.ts", "/index.tsx"]
        .map(ext => base + ext)].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(target, file + ": missing import " + specifier);
      const exports = new Set();
      for (const node of parse(fs.readFileSync(target, "utf8"), target).program.body) {
        if (node.type === "ExportDefaultDeclaration") exports.add("default");
        if (node.type === "ExportNamedDeclaration") {
          if (node.declaration?.id) exports.add(node.declaration.id.name);
          for (const decl of node.declaration?.declarations || []) if (decl.id.name) exports.add(decl.id.name);
          for (const spec of node.specifiers || []) exports.add(spec.exported.name);
        }
      }
      for (const imported of item.specifiers) {
        const name = imported.type === "ImportDefaultSpecifier" ? "default" : imported.imported?.name;
        if (name) assert.ok(exports.has(name), file + ": missing export " + name);
      }
    }
    babel.transformSync(source(file), {
      filename: path.resolve(file), configFile: false, babelrc: false, presets: [expoPreset],
      caller: { name: "metro", platform: "android", supportsStaticESM: true },
    });
    if ([marketFile, detailsFile, addFile, chatFile, sellerFile].includes(file)) {
      walk(tree.program, node => {
        if (node.type === "StringLiteral" && /(?:outline$|^logo-)/.test(node.value)) {
          assert.ok(Object.hasOwn(icons, node.value), file + ": invalid icon " + node.value);
        }
      });
    }
  }
  console.log("PASS syntax, imports, Expo Android transforms and icon names (" + files.length + " files)");
  const helper = loadCommonJS(helperFile, name => {
    assert.equal(name, "./supabase");
    return { supabase: {} };
  });
  await check("all eight categories and legacy null-category listings", () => {
    assert.equal(helper.MARKETPLACE_CATEGORIES.length, 8);
    for (const file of [marketFile, detailsFile]) {
      const context = extract(file, ["getListingCategory"]);
      for (const listing of [{}, { category: null }, { category: undefined }]) {
        assert.equal(context.getListingCategory(listing), "crayfish");
      }
      for (const category of helper.MARKETPLACE_CATEGORIES) {
        assert.equal(context.getListingCategory({ category }), category);
      }
    }
    const options = extract(addFile, ["CATEGORY_OPTIONS", "SUBCATEGORY_OPTIONS"]);
    for (const category of helper.MARKETPLACE_CATEGORIES) {
      assert.ok(vm.runInContext("CATEGORY_OPTIONS.some(item => item.value === " + JSON.stringify(category) + ")", options));
    }
  });
  await check("safe store URL normalization and rejected malformed/unsafe links", () => {
    for (const value of ["example.com/store", "https://shopee.ph/store", "http://example.com", "//example.com"]) {
      assert.match(helper.normalizeStoreUrl(value), /^https?:\/\//);
    }
    for (const value of ["", "javascript:alert(1)", "file:///tmp/a", "tel:123", "data:text/html,x",
      "https://user:password@example.com", "https://example.com\\evil", "https://example.com bad", "https://"]) {
      assert.equal(helper.normalizeStoreUrl(value), "");
    }
  });
  await check("reservations use current price, required order fields, and reserved listing status", async () => {
    const client = mockClient();
    await helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 2, buyerNote: " gate " }, client);
    const insert = client.calls.find(call => call.operation === "insert");
    assert.equal(JSON.stringify(insert.payload), JSON.stringify({
      listing_id: "listing", buyer_id: "buyer", seller_id: "seller", quantity: 2,
      total_price: 240, status: "pending", buyer_note: "gate",
    }));
    const transition = client.calls.find(call => call.operation === "update");
    assert.equal(transition.payload.status, "reserved");
    assert.ok(transition.filters.some(filter => filter[1] === "status" && filter[2] === "active"));
  });
  await check("own, unavailable, missing, invalid and excess-stock reservations cause no writes", async () => {
    const normal = { id: "listing", seller_id: "seller", status: "active", quantity: 5, price: 120 };
    const cases = [
      { userId: null }, { userId: "seller" }, { listing: null }, { existingOrder: { id: "existing" } },
      ...["hidden", "reserved", "sold", "deleted", "inactive"].map(status => ({ listing: { ...normal, status } })),
      ...[0, -1, 1.5, NaN, Infinity, 6].map(quantity => ({ quantity })),
      { listing: { ...normal, price: "invalid" } }, { listing: { ...normal, quantity: "invalid" } },
    ];
    for (const options of cases) {
      const client = mockClient(options);
      await assert.rejects(helper.reserveMarketplaceProduct({
        listingId: "listing", quantity: Object.hasOwn(options, "quantity") ? options.quantity : 1,
      }, client));
      assert.ok(client.calls.every(call => call.operation === "select"));
    }
  });
  await check("failed order inserts do not reserve listings; saved orders report status-update failure", async () => {
    const rejected = mockClient({ orderError: new Error("policy") });
    await assert.rejects(helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 1 }, rejected));
    assert.ok(!rejected.calls.some(call => call.operation === "update"));
    const statusError = new Error("listing update policy");
    const saved = await helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 1 },
      mockClient({ statusError }));
    assert.equal(saved.statusError, statusError);
    for (const options of [{ statusThrows: true }, { noStatusChange: true }]) {
      const client = mockClient(options);
      const result = await helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 1 }, client);
      assert.ok(result.statusError, "Saved orders must report network failures or silent zero-row updates");
      assert.equal(client.calls.filter(call => call.operation === "insert").length, 1);
    }
  });
  await check("reservation locking also prevents duplicate requests across Browse and Details", async () => {
    const client = mockClient();
    let release;
    client.auth.getUser = () => new Promise(resolve => { release = resolve; });
    const first = helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 1 }, client);
    await assert.rejects(helper.reserveMarketplaceProduct({ listingId: "listing", quantity: 1 }, client), /already being sent/);
    release({ data: { user: { id: "buyer" } }, error: null });
    await first;
    assert.equal(client.calls.filter(call => call.operation === "insert").length, 1);
  });
  const addContext = extract(addFile, ["EMPTY_FORM", "CATEGORY_OPTIONS", "SUBCATEGORY_OPTIONS", "UNIT_OPTIONS",
    "CONDITION_OPTIONS", "BREEDER_NOTE", "selectStage", "selectCategory", "validateForm", "handlePublish",
    "buildFinalDescription", "buildPickupLocation", "getCategoryLabel"], {
    publishLock: { current: false }, sellerProfile: sellerFixture, imageAsset: null,
    closeDropdowns() {}, setErrorText() {}, setStatusText() {}, setSaving() {},
    showError(title, message) { throw new Error(title + ": " + message); }, showSuccess() {},
    uploadImageIfSelected: async () => "https://example.com/image.jpg",
  });
  const resetAdd = () => {
    addContext.form = vm.runInContext("({ ...EMPTY_FORM })", addContext);
    Object.assign(addContext.form, { title: "Product", price: "120", size_label: "2 inch",
      seller_mobile: "09123456789", pickup_barangay: "Atlag", pickup_municipality: "Malolos" });
    addContext.isCrayfish = true; addContext.isBreeder = false;
  };
  addContext.setForm = updater => {
    addContext.form = typeof updater === "function" ? updater(addContext.form) : updater;
    addContext.isCrayfish = addContext.form.category === "crayfish";
    addContext.isBreeder = addContext.isCrayfish && addContext.form.stage === "breeder";
  };
  await check("breeder trio stays quantity 3, mixed sex and set unit after changing categories", () => {
    resetAdd(); addContext.selectStage("breeder");
    assert.equal(addContext.form.quantity, "3"); assert.equal(addContext.form.sex, "mixed");
    addContext.selectCategory("feeds"); addContext.form.quantity = "12";
    addContext.selectCategory("crayfish");
    assert.equal(addContext.form.quantity, "3"); assert.equal(addContext.form.sex, "mixed");
    assert.equal(addContext.form.unit, "set"); assert.equal(addContext.form.subcategory, "Breeder");
    assert.equal(addContext.validateForm(), "");
  });
  await check("general product and breeder publishing payloads preserve shared seller fields", async () => {
    for (const category of helper.MARKETPLACE_CATEGORIES) {
      resetAdd(); addContext.selectCategory(category);
      if (category === "crayfish") addContext.selectStage("breeder");
      else Object.assign(addContext.form, { brand: "Brand", sku: "SKU", is_custom_product: true });
      const client = mockClient({ seller: { ...sellerFixture, seller_mobile: "09999999999" } });
      addContext.supabase = client;
      await addContext.handlePublish();
      const payload = client.calls.find(call => call.table === "marketplace_listings" && call.operation === "insert").payload;
      assert.equal(payload.category, category);
      assert.equal(payload.seller_mobile, "09999999999");
      assert.equal(payload.pickup_municipality_code, sellerFixture.pickup_municipality_code);
      if (category === "crayfish") {
        assert.equal(payload.quantity, 3); assert.equal(payload.sex, "mixed");
        assert.match(payload.description, /2 female and 1 male/);
      } else {
        assert.equal(payload.brand, "Brand"); assert.equal(payload.sku, "SKU");
        assert.equal(payload.is_custom_product, true); assert.equal(payload.product_condition, "new");
      }
    }
  });
  await check("fractional listing quantities are rejected and inactive sellers cannot publish", async () => {
    resetAdd(); addContext.form.quantity = "1.5";
    assert.match(addContext.validateForm(), /quantity/);
    resetAdd(); addContext.supabase = mockClient({ seller: { ...sellerFixture, is_active: false } });
    await assert.rejects(addContext.handlePublish(), /active Seller Profile/);
    assert.ok(!addContext.supabase.calls.some(call => call.operation === "insert"));
  });
  await check("existing thread IDs and buyer/seller roles are preserved even without a listing", () => {
    const chat = extract(chatFile, ["resolveChatIds", "getOtherUserId", "getListingTitle"]);
    const thread = { id: "thread", listing_id: "listing", order_id: "order", buyer_id: "buyer", seller_id: "seller" };
    for (const user of ["buyer", "seller"]) {
      const ids = chat.resolveChatIds({ chatDetails: { thread }, currentUserId: user });
      assert.equal(ids.listingId, "listing"); assert.equal(ids.orderId, "order");
      assert.equal(ids.buyerId, "buyer"); assert.equal(ids.sellerId, "seller");
      assert.equal(ids.otherUserId, user === "buyer" ? "seller" : "buyer");
    }
    assert.equal(chat.getListingTitle(null, null), "Marketplace Product");
  });
  await check("owner status changes use conditional updates and reserved/sold/deleted remain locked", async () => {
    const market = extract(marketFile, ["canOwnerModifyListing", "updateListingStatus", "deleteListing", "canCancelOrder",
      "cancelReservation"], {
      currentUser: { id: "buyer" }, actionLocks: { current: new Set() },
      setUpdatingListingId() {}, setDeletingListingId() {}, setUpdatingOrderId() {},
      loadMarketplace: async () => {}, notify() {},
    });
    for (const status of ["reserved", "sold", "deleted"]) {
      market.supabase = mockClient();
      assert.equal(market.canOwnerModifyListing({ status }), false);
      await market.deleteListing({ id: "listing", status });
      assert.equal(market.supabase.calls.length, 0);
    }
    market.supabase = mockClient();
    await market.updateListingStatus({ id: "listing", status: "active" }, "hidden");
    const update = market.supabase.calls[0];
    assert.ok(update.filters.some(filter => filter[0] === "in" && filter[1] === "status"));
    assert.ok(update.filters.some(filter => filter[1] === "seller_id" && filter[2] === "buyer"));
    market.supabase = mockClient({ updateData: null });
    await market.cancelReservation({ id: "order", status: "pending" });
    assert.equal(market.supabase.calls.length, 1, "A stale/non-cancellable order must not reactivate its listing");
    assert.ok(market.supabase.calls[0].filters.some(filter => filter[1] === "buyer_id"));
  });
  await check("Seller Profile upserts every shared field by user_id and refuses to save after a failed load", async () => {
    const seller = extract(sellerFile, ["handleSaveSellerProfile", "normalizeOptionalUrl"], {
      normalizeStoreUrl: helper.normalizeStoreUrl, saveLock: { current: false }, profileLoaded: true,
      userId: "buyer", form: { ...sellerFixture }, validateSellerProfile: () => "",
      setErrorText() {}, setStatusText() {}, setSaving() {}, showNotice() {}, onBack() {},
      getFriendlySellerError: error => error.message,
      showError(title, message) { throw new Error(title + ": " + message); },
    });
    seller.supabase = mockClient();
    await seller.handleSaveSellerProfile();
    const upsert = seller.supabase.calls[0];
    assert.equal(upsert.table, "seller_profiles"); assert.equal(upsert.settings.onConflict, "user_id");
    for (const key of Object.keys(sellerFixture)) assert.ok(Object.hasOwn(upsert.payload, key), key);
    seller.profileLoaded = false; seller.supabase = mockClient();
    await assert.rejects(seller.handleSaveSellerProfile(), /existing record/);
    assert.equal(seller.supabase.calls.length, 0);
  });

  await check("duplicate reservation taps submit only one request", async () => {
    for (const [file, method] of [[marketFile, "handleReserveListing"], [detailsFile, "handleReserve"]]) {
      let requests = 0, release;
      const pending = new Promise(resolve => { release = resolve; });
      const context = extract(file, [method], {
        reserveLock: { current: false }, reserving: false, refreshing: false, loading: false,
        listing: { id: "listing" }, reserveQuantity: "2", buyerNote: "", Platform: { OS: "web" },
        reserveMarketplaceProduct: () => { requests++; return pending; },
        setReservingId() {}, setReserving() {}, setSelectedListingId() {}, setReserveQuantity() {},
        setBuyerNote() {}, setActiveTab() {}, setMessage() {}, setListing() {}, notify() {}, showMessage() {},
        loadMarketplace: async () => {}, onReserved() {},
      });
      const first = context[method]({ id: "listing" });
      await context[method]({ id: "listing" });
      assert.equal(requests, 1);
      release({ listing: { id: "listing", status: "active" }, statusError: null });
      await first;
      assert.equal(context.reserveLock.current, false);
    }
  });
  const palette = loadCommonJS("src/constants/theme.js", () => { throw new Error("Unexpected theme dependency"); });
  function renderScreen(file, mode, seed = {}, props = {}) {
    const colors = mode === "light" ? palette.LIGHT_COLORS : palette.DARK_COLORS;
    const stateNames = rootFunction(file).body.body
      .filter(node => node.type === "VariableDeclaration")
      .flatMap(node => node.declarations)
      .filter(node => node.init?.type === "CallExpression" && node.init.callee.name === "useState")
      .map(node => node.id.elements[0].name);
    let index = 0;
    const state = { loading: false, currentUser: { id: "buyer" }, currentUserId: "buyer",
      seller: sellerFixture, sellerProfile: sellerFixture, userId: "buyer", profileLoaded: true, ...seed };
    const react = {
      Fragment: "Fragment",
      createElement(type, componentProps, ...children) { return { type, props: componentProps || {}, children }; },
      useState(initial) {
        const name = stateNames[index++];
        if (!Object.hasOwn(state, name)) state[name] = typeof initial === "function" ? initial() : initial;
        return [state[name], value => { state[name] = typeof value === "function" ? value(state[name]) : value; }];
      },
      useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
      useRef: value => ({ current: value }),
    };
    const component = loadCommonJS(file, specifier => {
      if (specifier === "react") return { __esModule: true, default: react, ...react };
      if (specifier === "react-native") return new Proxy({
        Platform: { OS: "android" }, StyleSheet: { create: styles => styles },
      }, { get: (object, key) => object[key] || key });
      if (specifier === "@expo/vector-icons") return { Ionicons: "Ionicons" };
      if (specifier.endsWith("/ThemeContext")) return { useAppTheme: () => ({ colors, isDark: mode === "dark" }) };
      if (specifier.endsWith("/constants/theme")) return palette;
      if (specifier.endsWith("/marketplace")) return helper;
      if (specifier.endsWith("/supabase")) return { supabase: {} };
      if (/\/(philippineTime|serverClock)$/.test(specifier)) return require('./check-mobile-ui.cjs').harness().load('src/utils/' + specifier.split('/').at(-1) + '.js');
      return { __esModule: true, default: path.basename(specifier) };
    }).default;
    const elements = [];
    const texts = [];
    function renderElement(element) {
      if (element == null || typeof element === "boolean") return;
      if (Array.isArray(element)) { element.forEach(renderElement); return; }
      if (typeof element === "string" || typeof element === "number") { texts.push(String(element)); return; }
      elements.push(element);
      if (typeof element.type === "function") {
        renderElement(element.type({ ...element.props, children: element.children }));
      } else element.children.forEach(renderElement);
    }
    function render() {
      index = 0; elements.length = 0; texts.length = 0;
      const element = component(props); renderElement(element);
      return element;
    }
    const element = render();
    return { colors, state, elements, texts, element, render };
  }
  await check("all Marketplace tabs render both themes, general products and legacy listings", () => {
    const legacy = { id: "old", category: null, title: "Legacy crayfish", seller_id: "seller",
      stage: "adult", crayfish_type: "Redclaw", quantity: 5, price: 100, unit: "piece", status: "active" };
    const feed = { ...legacy, id: "feed", category: "feeds", title: "Pellets", brand: "Brand",
      subcategory: "Pellets", product_condition: "new", unit: "bag" };
    const order = { id: "order", listing_id: "feed", buyer_id: "buyer", seller_id: "seller",
      status: "pending", quantity: 1, total_price: 100, listing: feed };
    for (const mode of ["dark", "light"]) {
      for (const tab of ["browse", "chats", "myListings", "sales", "reservations"]) {
        const rendered = renderScreen(marketFile, mode, { activeTab: tab, listings: [legacy, feed],
          myListings: [legacy, feed], reservations: [order], sellerOrders: [order] });
        for (const text of ["Browse", "Chats", "Listings", "Sales", "Orders"]) assert.ok(rendered.texts.includes(text));
        if (tab === "browse") assert.ok(rendered.texts.includes("Details"));
      }
      const general = renderScreen(detailsFile, mode, { listing: feed }, { listing: feed });
      assert.ok(general.texts.includes("Product Information"));
      assert.ok(general.texts.includes("Brand"));
      assert.ok(!general.texts.includes("Crayfish Type"));
      assert.ok(general.texts.includes("Store"));
      for (const label of ["Shopee", "Lazada", "Facebook", "TikTok", "Website"]) assert.ok(general.texts.includes(label));
      const crayfish = renderScreen(detailsFile, mode, { listing: legacy }, { listing: legacy });
      assert.ok(crayfish.texts.includes("Crayfish Information"));
      const seller = renderScreen(sellerFile, mode);
      assert.ok(seller.elements.some(element => element.type === "Text" &&
        element.props.style?.color === seller.colors.textStrong), "Seller profile text must use current theme");
      renderScreen(chatFile, mode);
      renderScreen(addFile, mode, { form: { category: "feeds", title: "", unit: "bag", product_condition: "new" } });
    }
  });
  await check("Details, Back and Chat Seller callbacks preserve the selected listing", () => {
    const listing = { id: "feed", seller_id: "seller", title: "Feed", category: "feeds", status: "active",
      quantity: 5, price: 100, unit: "bag" };
    let chatDetails;
    const rendered = renderScreen(marketFile, "light", { listings: [listing] }, { onOpenChat: details => { chatDetails = details; } });
    const details = rendered.elements.find(element => element.props.accessibilityLabel === "View product details");
    details.props.onPress();
    const detailScreen = rendered.render();
    assert.equal(detailScreen.type, "MarketplaceProductDetailsScreen");
    assert.equal(detailScreen.props.listing.id, "feed");
    detailScreen.props.onBack();
    rendered.render();
    assert.equal(rendered.state.selectedProduct, null);
    assert.equal(rendered.state.activeTab, "browse");
    details.props.onPress();
    const reopened = rendered.render();
    reopened.props.onChatSeller(listing);
    assert.equal(chatDetails.listing.id, "feed");
    assert.equal(chatDetails.otherUserId, "seller");
    assert.equal(chatDetails.currentUserId, "buyer");
    assert.equal(rendered.state.selectedProduct, null);
  });

  const lint = new ESLint();
  const result = await lint.lintFiles([...files, "scripts/check-marketplace.cjs"]);
  const errors = result.reduce((sum, item) => sum + item.errorCount, 0);
  const warnings = result.reduce((sum, item) => sum + item.warningCount, 0);
  if (errors || warnings) {
    const formatter = await lint.loadFormatter("stylish");
    console.log(formatter.format(result));
  }
  assert.equal(errors, 0, "ESLint errors");
  assert.equal(warnings, 0, "ESLint warnings");
  console.log("PASS ESLint: 0 errors, 0 warnings");
  console.log("Marketplace audit passed: " + behaviorChecks + " behavior groups. No live database actions or APK build.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
