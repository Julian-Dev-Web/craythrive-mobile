import { formatPhilippineDate } from '../../utils/philippineTime';
// src/screens/main/MarketplaceScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import { COLORS, RADIUS } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { reserveMarketplaceProduct } from "../../lib/marketplace";
import MarketplaceProductDetailsScreen from "./MarketplaceProductDetailsScreen";
import ResilientImage from '../../components/ui/ResilientImage';

const TABS = [
  { key: "browse", label: "Browse", icon: "search-outline" },
  { key: "chats", label: "Chats", icon: "chatbubbles-outline" },
  { key: "myListings", label: "Listings", icon: "albums-outline" },
  { key: "sales", label: "Sales", icon: "bag-check-outline" },
  { key: "reservations", label: "Orders", icon: "receipt-outline" },
];

const CATEGORY_FILTERS = [
  { label: "All", value: "all", icon: "apps-outline" },
  { label: "Crayfish", value: "crayfish", icon: "fish-outline" },
  { label: "Feeds", value: "feeds", icon: "nutrition-outline" },
  { label: "Tanks", value: "tanks_enclosures", icon: "cube-outline" },
  { label: "Water Care", value: "water_care", icon: "water-outline" },
  { label: "Test Kits", value: "test_kits", icon: "flask-outline" },
  { label: "Equipment", value: "equipment", icon: "construct-outline" },
  {
    label: "Accessories",
    value: "accessories",
    icon: "hardware-chip-outline",
  },
  {
    label: "Others",
    value: "others",
    icon: "ellipsis-horizontal-circle-outline",
  },
];

const STAGE_FILTERS = [
  { label: "All Stages", value: "all" },
  { label: "Juvenile", value: "juvenile" },
  { label: "Adult", value: "adult" },
  { label: "Breeder", value: "breeder" },
];

export default function MarketplaceScreen({
  onAddListing,
  onOpenChat,
  isVisible = true,
}) {
  const { colors, styles } = useThemePack();

  const reserveLock = useRef(false);
  const actionLocks = useRef(new Set());
  const [activeTab, setActiveTab] = useState("browse");
  const [currentUser, setCurrentUser] = useState(null);

  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [sellerOrders, setSellerOrders] = useState([]);
  const [chatThreads, setChatThreads] = useState([]);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeStage, setActiveStage] = useState("all");

  const [selectedListingId, setSelectedListingId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reserveQuantity, setReserveQuantity] = useState("1");
  const [buyerNote, setBuyerNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [reservingId, setReservingId] = useState("");
  const [updatingListingId, setUpdatingListingId] = useState("");
  const [deletingListingId, setDeletingListingId] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");



  const filteredListings = useMemo(() => {
    const search = query.trim().toLowerCase();

    return listings.filter((item) => {
      const category = getListingCategory(item);

      const matchesCategory =
        activeCategory === "all" ||
        category === activeCategory;

      const matchesStage =
        activeStage === "all" ||
        category !== "crayfish" ||
        String(item.stage || "").toLowerCase() === activeStage;

      const searchable = [
        item.title,
        getCategoryLabel(category),
        item.subcategory,
        item.brand,
        item.sku,
        ...(category === "crayfish"
          ? [item.crayfish_type, item.stage, item.sex, item.size_label]
          : []),
        item.unit,
        item.product_condition,
        item.location,
        item.pickup_municipality,
        item.pickup_barangay,
        item.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesCategory &&
        matchesStage &&
        (!search || searchable.includes(search))
      );
    });
  }, [
    listings,
    query,
    activeCategory,
    activeStage,
  ]);

  const unreadChatCount = useMemo(
    () =>
      chatThreads.reduce(
        (sum, thread) =>
          sum +
          Number(
            thread.unreadCount || 0
          ),
        0
      ),
    [chatThreads]
  );

  const notify = useCallback((type, text) => {
    setMessageType(type);
    setMessage(text);

    if (Platform.OS !== "web") {
      Alert.alert(
        type === "success"
          ? "Success"
          : "Notice",
        text
      );
    }
  }, []);

  

  const loadMyListings = useCallback(async (
    userId,
    showError = true
  ) => {
    if (!userId) {
      setMyListings([]);
      return;
    }

    try {
      const {
        data,
        error,
      } = await supabase
        .from("marketplace_listings")
        .select("*")
        .eq(
          "seller_id",
          userId
        )
        .neq(
          "status",
          "deleted"
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setMyListings(
        data || []
      );
    } catch (error) {
      console.log("LOAD MY LISTINGS ERROR:");

      if (showError) {
        notify(
          "error",
          error?.message ||
            "Failed to load your listings."
        );
      }
    }
  }, [notify]);

  const loadReservations = useCallback(async (
    userId,
    showError = true
  ) => {
    if (!userId) {
      setReservations([]);
      return;
    }

    try {
      const {
        data: orderData,
        error,
      } = await supabase
        .from("marketplace_orders")
        .select("*")
        .eq(
          "buyer_id",
          userId
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const orders =
        orderData || [];

      const listingMap =
        await getListingMap(
          orders.map(
            (order) =>
              order.listing_id
          )
        );

      setReservations(
        orders.map((order) => ({
          ...order,

          listing:
            listingMap[
              order.listing_id
            ] || null,
        }))
      );
    } catch (error) {
      console.log("LOAD RESERVATIONS ERROR:");

      if (showError) {
        notify(
          "error",
          error?.message ||
            "Failed to load orders."
        );
      }
    }
  }, [notify]);

  const loadSellerOrders = useCallback(async (
    userId,
    showError = true
  ) => {
    if (!userId) {
      setSellerOrders([]);
      return;
    }

    try {
      const {
        data: orderData,
        error,
      } = await supabase
        .from("marketplace_orders")
        .select("*")
        .eq(
          "seller_id",
          userId
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const orders =
        orderData || [];

      const listingMap =
        await getListingMap(
          orders.map(
            (order) =>
              order.listing_id
          )
        );

      const buyerMap =
        await getProfileMap(
          orders.map(
            (order) =>
              order.buyer_id
          )
        );

      setSellerOrders(
        orders.map((order) => ({
          ...order,

          listing:
            listingMap[
              order.listing_id
            ] || null,

          buyer:
            buyerMap[
              order.buyer_id
            ] || null,
        }))
      );
    } catch (error) {
      console.log("LOAD SELLER ORDERS ERROR:");

      if (showError) {
        notify(
          "error",
          error?.message ||
            "Failed to load sales."
        );
      }
    }
  }, [notify]);

  const loadChatThreads = useCallback(async (
    userId,
    showError = true
  ) => {
    if (!userId) {
      setChatThreads([]);
      return;
    }

    try {
      const {
        data: threadData,
        error,
      } = await supabase
        .from(
          "marketplace_chat_threads"
        )
        .select("*")
        .or(
          `buyer_id.eq.${userId},seller_id.eq.${userId}`
        )
        .order("updated_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      const visible =
        (threadData || []).filter(
          (thread) => {
            if (
              thread.buyer_id ===
                userId &&
              thread.buyer_deleted_at
            ) {
              return false;
            }

            if (
              thread.seller_id ===
                userId &&
              thread.seller_deleted_at
            ) {
              return false;
            }

            return true;
          }
        );

      const listingMap =
        await getListingMap(
          visible.map(
            (thread) =>
              thread.listing_id
          )
        );

      const orderMap =
        await getOrderMap(
          visible.map(
            (thread) =>
              thread.order_id
          )
        );

      const otherIds =
        visible.map((thread) =>
          thread.buyer_id ===
          userId
            ? thread.seller_id
            : thread.buyer_id
        );

      const profileMap =
        await getProfileMap(
          otherIds
        );

      const unreadMap =
        await getUnreadMap(
          visible.map(
            (thread) =>
              thread.id
          ),
          userId
        );

      setChatThreads(
        visible.map(
          (thread) => {
            const otherUserId =
              thread.buyer_id ===
              userId
                ? thread.seller_id
                : thread.buyer_id;

            return {
              ...thread,

              listing:
                listingMap[
                  thread.listing_id
                ] || null,

              order:
                orderMap[
                  thread.order_id
                ] || null,

              otherUserId,

              otherProfile:
                profileMap[
                  otherUserId
                ] || null,

              unreadCount:
                unreadMap[
                  thread.id
                ] || 0,
            };
          }
        )
      );
    } catch (error) {
      console.log("LOAD CHATS ERROR:");

      if (showError) {
        notify(
          "error",
          error?.message ||
            "Failed to load chats."
        );
      }
    }
  }, [notify]);

  

  

  

  

  const loadMarketplace = useCallback(async (
    showLoader = false
  ) => {
    if (showLoader) {
      setLoading(true);
    }

    setMessage("");

    try {
      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.log("GET MARKETPLACE USER ERROR:");
      }

      const user =
        userData?.user || null;

      setCurrentUser(user);

      const {
        data: listingData,
        error: listingError,
      } = await supabase
        .from("marketplace_listings")
        .select("*")
        .eq("status", "active")
        .order("created_at", {
          ascending: false,
        });

      if (listingError) {
        throw listingError;
      }

      setListings(
        listingData || []
      );

      if (user?.id) {
        await Promise.all([
          loadMyListings(
            user.id,
            false
          ),
          loadReservations(
            user.id,
            false
          ),
          loadSellerOrders(
            user.id,
            false
          ),
          loadChatThreads(
            user.id,
            false
          ),
        ]);
      } else {
        setMyListings([]);
        setReservations([]);
        setSellerOrders([]);
        setChatThreads([]);
      }
    } catch (error) {
      console.log("LOAD MARKETPLACE ERROR:");

      notify(
        "error",
        error?.message ||
          "Failed to load Marketplace."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadMyListings, loadReservations, loadSellerOrders, loadChatThreads, notify]);

  async function handleRefresh() {
    setRefreshing(true);

    await loadMarketplace(
      false
    );
  }

  function handleTabChange(
    tab
  ) {
    setActiveTab(tab);

    setSelectedListingId(
      ""
    );

    setReserveQuantity(
      "1"
    );

    setBuyerNote("");

    if (
      tab === "chats"
    ) {
      loadChatThreads(
        currentUser?.id,
        false
      );
    }

    if (
      tab ===
      "myListings"
    ) {
      loadMyListings(
        currentUser?.id,
        false
      );
    }

    if (
      tab === "sales"
    ) {
      loadSellerOrders(
        currentUser?.id,
        false
      );
    }

    if (
      tab ===
      "reservations"
    ) {
      loadReservations(
        currentUser?.id,
        false
      );
    }
  }

  function handleOpenChat({
    listing,
    order,
    thread,
    targetRole,
  }) {
    if (
      !currentUser?.id
    ) {
      notify(
        "error",
        "Please sign in before using chat."
      );

      return;
    }

    const otherUserId =
      targetRole ===
      "seller"
        ? listing?.seller_id ||
          order?.seller_id ||
          thread?.seller_id
        : order?.buyer_id ||
          thread?.buyer_id;

    if (
      !otherUserId ||
      otherUserId ===
        currentUser.id
    ) {
      notify(
        "error",
        "Chat user is unavailable for this transaction."
      );

      return;
    }

    if (
      typeof onOpenChat ===
      "function"
    ) {
      setSelectedProduct(null);
      onOpenChat({
        listing:
          listing || null,

        order:
          order || null,

        thread:
          thread || null,

        currentUserId:
          currentUser.id,

        otherUserId,

        targetRole,
      });
    }
  }

  async function handleReserveListing(listing) {
    if (reserveLock.current) return;
    reserveLock.current = true;
    setReservingId(listing?.id || "");
    try {
      const { statusError } = await reserveMarketplaceProduct({
        listingId: listing?.id,
        quantity: Number(reserveQuantity),
        buyerNote,
      });
      setSelectedListingId("");
      setReserveQuantity("1");
      setBuyerNote("");
      setActiveTab("reservations");
      await loadMarketplace(false);
      notify(statusError ? "error" : "success", statusError
        ? "Reservation saved in Orders, but the listing status could not be updated. Do not submit it again; contact the seller."
        : "Reservation request sent.");
    } catch (error) {
      console.log("RESERVE PRODUCT ERROR:");
      notify("error", error?.message || "Failed to reserve product.");
    } finally {
      reserveLock.current = false;
      setReservingId("");
    }
  }

  async function updateListingStatus(listing, nextStatus) {
    if (!currentUser?.id || !listing?.id || !canOwnerModifyListing(listing) ||
        !["active", "hidden"].includes(nextStatus) || actionLocks.current.has(listing.id)) return;
    actionLocks.current.add(listing.id);
    setUpdatingListingId(listing.id);
    try {
      const { data, error } = await supabase.from("marketplace_listings")
        .update({ status: nextStatus }).eq("id", listing.id)
        .eq("seller_id", currentUser.id).in("status", ["active", "hidden", "inactive"])
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This product has changed or is reserved/sold. Refresh your listings.");
      await loadMarketplace(false);
      notify("success", nextStatus === "active" ? "Product activated." : "Product hidden.");
    } catch (error) {
      notify("error", error?.message || "Failed to update product.");
    } finally {
      actionLocks.current.delete(listing.id);
      setUpdatingListingId("");
    }
  }

  function confirmListingStatus(
    listing,
    nextStatus
  ) {
    if (
      !canOwnerModifyListing(
        listing
      )
    ) {
      notify(
        "error",
        "Reserved or sold products cannot be changed."
      );

      return;
    }

    const action =
      nextStatus ===
      "active"
        ? "activate"
        : "hide";

    confirmAction(
      `${capitalize(
        action
      )} product`,

      `Do you want to ${action} this product?`,

      () =>
        updateListingStatus(
          listing,
          nextStatus
        )
    );
  }

  async function deleteListing(listing) {
    if (!currentUser?.id || !listing?.id || !canOwnerModifyListing(listing) ||
        actionLocks.current.has(listing.id)) return;
    actionLocks.current.add(listing.id);
    setDeletingListingId(listing.id);
    try {
      const { data, error } = await supabase.from("marketplace_listings")
        .update({ status: "deleted" }).eq("id", listing.id)
        .eq("seller_id", currentUser.id).in("status", ["active", "hidden", "inactive"])
        .select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This product has changed or is reserved/sold. Refresh your listings.");
      await loadMarketplace(false);
      notify("success", "Product removed from Marketplace.");
    } catch (error) {
      notify("error", error?.message || "Failed to remove product.");
    } finally {
      actionLocks.current.delete(listing.id);
      setDeletingListingId("");
    }
  }

  function confirmDeleteListing(
    listing
  ) {
    if (
      !canOwnerModifyListing(
        listing
      )
    ) {
      notify(
        "error",
        "Reserved or sold products cannot be removed."
      );

      return;
    }

    confirmAction(
      "Remove product",

      "Remove this product from Marketplace? The database record will be kept for history.",

      () =>
        deleteListing(
          listing
        ),

      true
    );
  }

  async function cancelReservation(order) {
    if (!currentUser?.id || !order?.id || !canCancelOrder(order) ||
        actionLocks.current.has(order.id)) return;
    actionLocks.current.add(order.id);
    setUpdatingOrderId(order.id);
    try {
      const { data: cancelledOrder, error } = await supabase.from("marketplace_orders")
        .update({ status: "cancelled" }).eq("id", order.id).eq("buyer_id", currentUser.id)
        .in("status", ["pending", "confirmed"]).select("*").maybeSingle();
      if (error) throw error;
      if (!cancelledOrder) throw new Error("This order has changed and can no longer be cancelled. Refresh Orders.");
      const { error: listingError } = await supabase.from("marketplace_listings")
        .update({ status: "active" }).eq("id", cancelledOrder.listing_id).eq("status", "reserved");
      await loadMarketplace(false);
      notify(listingError ? "error" : "success", listingError
        ? "Reservation cancelled, but the product could not be reactivated. Please contact the seller."
        : "Reservation cancelled.");
    } catch (error) {
      notify("error", error?.message || "Failed to cancel reservation.");
    } finally {
      actionLocks.current.delete(order.id);
      setUpdatingOrderId("");
    }
  }

  function confirmCancelReservation(
    order
  ) {
    confirmAction(
      "Cancel reservation",

      "Do you want to cancel this reservation?",

      () =>
        cancelReservation(
          order
        ),

      true
    );
  }

  useEffect(() => {
    if (isVisible) loadMarketplace(true);
  }, [isVisible, loadMarketplace]);

  useEffect(() => {
    if (!isVisible || !currentUser?.id) return;
    const userId = currentUser.id;
    let refreshTimer;
    const refreshChats = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadChatThreads(userId, false), 250);
    };
    const channel = supabase.channel("marketplace-inbox-" + userId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "marketplace_chat_messages",
        filter: "receiver_id=eq." + userId,
      }, refreshChats)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "marketplace_chat_threads",
        filter: "buyer_id=eq." + userId,
      }, refreshChats)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "marketplace_chat_threads",
        filter: "seller_id=eq." + userId,
      }, refreshChats)
      .subscribe();
    return () => {
      clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [isVisible, currentUser?.id, loadChatThreads]);

  if (selectedProduct) {
    return (
      <MarketplaceProductDetailsScreen
        key={selectedProduct.id}
        listing={selectedProduct}
        onBack={() => setSelectedProduct(null)}
        onChatSeller={(listing) =>
          handleOpenChat({ listing, targetRole: "seller" })
        }
        onReserved={() => {
          setSelectedProduct(null);
          setSelectedListingId("");
          setReserveQuantity("1");
          setBuyerNote("");
          setActiveTab("reservations");
          loadMarketplace(false);
        }}
      />
    );
  }

  return (
    <AppScreen keyboard>
      <View
        style={
          styles.root
        }
      >
        <AppHeader
          eyebrow="CrayThrive"
          title="Marketplace"
          rightAction="refresh-outline"
          onRightPress={() =>
            loadMarketplace(
              true
            )
          }
          rightDisabled={loading || refreshing}
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={
                handleRefresh
              }
              tintColor={
                colors.accent2
              }
              colors={[
                colors.accent2,
              ]}
            />
          }
          contentContainerStyle={
            styles.scroll
          }
        >
          <MarketplaceSummary
            activeListings={
              listings.length
            }
            myListings={
              myListings.length
            }
            reservations={
              reservations.length
            }
            unreadChats={
              unreadChatCount
            }
            colors={
              colors
            }
            styles={
              styles
            }
            onTabChange={handleTabChange}
          />

          {message ? (
            <MessageBox
              type={
                messageType
              }
              message={
                message
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          <View style={styles.segmentWrap}>
            <View
              accessibilityRole="tablist"
              style={
                styles.segment
              }
            >
              {TABS.map(
                (item) => {
                  const active =
                    activeTab ===
                    item.key;

                  const badge =
                    item.key ===
                    "chats"
                      ? unreadChatCount
                      : 0;

                  return (
                    <TouchableOpacity
                      accessibilityRole="tab"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: active }}
                      key={
                        item.key
                      }
                      activeOpacity={
                        0.86
                      }
                      style={[
                        styles.segmentButton,

                        active &&
                          styles.segmentActive,
                      ]}
                      onPress={() =>
                        handleTabChange(
                          item.key
                        )
                      }
                    >
                      <Ionicons
                        name={
                          item.icon
                        }
                        size={18}
                        color={
                          active
                            ? colors.accent2
                            : colors.muted
                        }
                      />

                      <Text
                        style={[
                          styles.segmentText,

                          active &&
                            styles.segmentTextActive,
                        ]}
                      >
                        {
                          item.label
                        }
                      </Text>

                      {badge >
                      0 ? (
                        <View
                          style={
                            styles.tabBadge
                          }
                        >
                          <Text
                            style={
                              styles.tabBadgeText
                            }
                          >
                            {badge >
                            9
                              ? "9+"
                              : badge}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                }
              )}
            </View>
          </View>

          {activeTab ===
          "browse" ? (
            <BrowseTab
              loading={
                loading
              }
              query={
                query
              }
              setQuery={
                setQuery
              }
              activeCategory={
                activeCategory
              }
              setActiveCategory={(
                value
              ) => {
                setActiveCategory(
                  value
                );

                if (
                  value !==
                  "crayfish"
                ) {
                  setActiveStage(
                    "all"
                  );
                }
              }}
              activeStage={
                activeStage
              }
              setActiveStage={
                setActiveStage
              }
              listings={
                filteredListings
              }
              currentUser={
                currentUser
              }
              selectedListingId={
                selectedListingId
              }
              setSelectedListingId={
                setSelectedListingId
              }
              reserveQuantity={
                reserveQuantity
              }
              setReserveQuantity={
                setReserveQuantity
              }
              buyerNote={
                buyerNote
              }
              setBuyerNote={
                setBuyerNote
              }
              reservingId={
                reservingId
              }
              onDetails={setSelectedProduct}
              onReserve={
                handleReserveListing
              }
              onRefresh={() =>
                loadMarketplace(
                  true
                )
              }
              onChatSeller={(
                listing
              ) =>
                handleOpenChat({
                  listing,

                  targetRole:
                    "seller",
                })
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          {activeTab ===
          "chats" ? (
            <ChatsTab
              threads={
                chatThreads
              }
              loading={
                loading
              }
              onRefresh={() =>
                loadChatThreads(
                  currentUser?.id,
                  true
                )
              }
              onOpenChat={(
                thread
              ) =>
                handleOpenChat({
                  listing:
                    thread.listing,

                  order:
                    thread.order,

                  thread,

                  targetRole:
                    thread.buyer_id ===
                    currentUser?.id
                      ? "seller"
                      : "buyer",
                })
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          {activeTab ===
          "myListings" ? (
            <MyListingsTab
              listings={
                myListings
              }
              loading={
                loading
              }
              updatingListingId={
                updatingListingId
              }
              deletingListingId={
                deletingListingId
              }
              onAdd={
                onAddListing
              }
              onRefresh={() =>
                loadMyListings(
                  currentUser?.id,
                  true
                )
              }
              onUpdateStatus={
                confirmListingStatus
              }
              onDelete={
                confirmDeleteListing
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          {activeTab ===
          "sales" ? (
            <SalesTab
              orders={
                sellerOrders
              }
              loading={
                loading
              }
              onRefresh={() =>
                loadSellerOrders(
                  currentUser?.id,
                  true
                )
              }
              onChatBuyer={(
                order
              ) =>
                handleOpenChat({
                  order,

                  listing:
                    order.listing,

                  targetRole:
                    "buyer",
                })
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          {activeTab ===
          "reservations" ? (
            <ReservationsTab
              reservations={
                reservations
              }
              loading={
                loading
              }
              updatingOrderId={
                updatingOrderId
              }
              onRefresh={() =>
                loadReservations(
                  currentUser?.id,
                  true
                )
              }
              onCancel={
                confirmCancelReservation
              }
              onChatSeller={(
                order
              ) =>
                handleOpenChat({
                  order,

                  listing:
                    order.listing,

                  targetRole:
                    "seller",
                })
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function MarketplaceSummary({ activeListings, myListings, reservations, unreadChats, onTabChange, styles }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryStats}>
        <SummaryStat value={activeListings} label="Products" onPress={() => onTabChange('browse')} styles={styles} />
        <SummaryStat value={myListings} label="Listings" onPress={() => onTabChange('myListings')} styles={styles} />
        <SummaryStat value={reservations} label="Orders" onPress={() => onTabChange('reservations')} styles={styles} />
        <SummaryStat value={unreadChats} label="Unread" onPress={() => onTabChange('chats')} styles={styles} />
      </View>
    </View>
  );
}

function SummaryStat({ value, label, onPress, styles }) {
  return (
    <TouchableOpacity style={styles.summaryStat} onPress={onPress} activeOpacity={0.75}
      accessibilityRole="button" accessibilityLabel={value + ' ' + label}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function BrowseTab({
  loading,
  query,
  setQuery,

  activeCategory,
  setActiveCategory,

  activeStage,
  setActiveStage,

  listings,

  currentUser,

  selectedListingId,
  setSelectedListingId,

  reserveQuantity,
  setReserveQuantity,

  buyerNote,
  setBuyerNote,

  reservingId,

  onDetails,
  onReserve,
  onRefresh,
  onChatSeller,

  colors,
  styles,
}) {
  return (
    <View>
      <View
        style={
          styles.searchBox
        }
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={
            colors.accent2
          }
        />

        <TextInput
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder="Search products or locations"
          accessibilityLabel="Search Marketplace products"
          returnKeyType="search"
          placeholderTextColor={
            colors.inputPlaceholder
          }
          style={
            styles.searchInput
          }
          autoCorrect={
            false
          }
        />

        {query ? (
          <TouchableOpacity
            style={styles.searchClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() =>
              setQuery("")
            }
          >
            <Ionicons
              name="close"
              size={18}
              color={
                colors.muted
              }
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterHeading}>
        <Text style={styles.filterLabel}>Categories</Text>
        {activeCategory !== 'all' || activeStage !== 'all' ? (
          <TouchableOpacity style={styles.filterReset} accessibilityRole="button" accessibilityLabel="Reset category and stage filters"
            onPress={() => { setActiveCategory('all'); setActiveStage('all'); }}>
            <Ionicons name="refresh-outline" size={13} color={colors.accent2} />
            <Text style={styles.filterResetText}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.categoryGrid}>
        {CATEGORY_FILTERS.map(item => {
          const active = activeCategory === item.value;
          return (
            <TouchableOpacity key={item.value} activeOpacity={0.8}
              accessibilityRole="button" accessibilityState={{ selected: active }}
              accessibilityLabel={item.value === 'all' ? 'Show all products' : 'Show ' + item.label + ' products'}
              style={[styles.categoryTile, active && styles.categoryTileActive]}
              onPress={() => setActiveCategory(item.value)}>
              {active ? <Ionicons name="checkmark-circle" size={13} color={colors.accent2} style={styles.categorySelectedMark} /> : null}
              <View style={[styles.categoryIcon, active && styles.categoryIconActive]}>
                {item.value === 'crayfish' ? <CrayfishIcon size={20} color={active ? colors.accent2 : colors.muted} />
                  : <Ionicons name={item.icon} size={19} color={active ? colors.accent2 : colors.muted} />}
              </View>
              <Text style={[styles.categoryTileText, active && styles.categoryTileTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeCategory === 'crayfish' ? (
        <View style={styles.stageSection}>
          <Text style={styles.stageLabel}>Crayfish stage</Text>
          <View style={styles.stageRow}>
            {STAGE_FILTERS.map(item => {
              const active = activeStage === item.value;
              return (
                <TouchableOpacity key={item.value} activeOpacity={0.8}
                  accessibilityRole="button" accessibilityState={{ selected: active }}
                  accessibilityLabel={'Filter by ' + item.label.toLowerCase()}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setActiveStage(item.value)}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <SectionTitle
        title="Available Products"
        subtitle={`${listings.length} ${
          listings.length === 1
            ? "product"
            : "products"
        } found`}
        action={
          loading
            ? "Loading..."
            : "Refresh"
        }
        onActionPress={
          onRefresh
        }
        styles={
          styles
        }
      />

      {loading ? (
        <LoadingCard
          text="Loading Marketplace products..."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : listings.length ===
        0 ? (
        <EmptyState
          icon="search-outline"
          title="No products found"
          text="Try a different category, stage, or search term."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : (
        <View
          style={
            styles.cardList
          }
        >
          {listings.map(
            (item) => (
              <ListingCard
                key={
                  item.id
                }
                item={
                  item
                }
                currentUser={
                  currentUser
                }
                selected={
                  selectedListingId ===
                  item.id
                }
                reserveQuantity={
                  reserveQuantity
                }
                setReserveQuantity={
                  setReserveQuantity
                }
                buyerNote={
                  buyerNote
                }
                setBuyerNote={
                  setBuyerNote
                }
                reserving={
                  reservingId ===
                  item.id
                }
                onToggle={() => {
                  const opening =
                    selectedListingId !==
                    item.id;

                  setSelectedListingId(
                    opening
                      ? item.id
                      : ""
                  );

                  setReserveQuantity(
                    "1"
                  );

                  setBuyerNote("");
                }}
                onDetails={() => onDetails(item)}
                onReserve={() =>
                  onReserve(
                    item
                  )
                }
                onChatSeller={() =>
                  onChatSeller(
                    item
                  )
                }
                colors={
                  colors
                }
                styles={
                  styles
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

function ListingCard({
  item,
  currentUser,
  selected,

  reserveQuantity,
  setReserveQuantity,

  buyerNote,
  setBuyerNote,

  reserving,

  onToggle,
  onDetails,
  onReserve,
  onChatSeller,

  colors,
  styles,
}) {
  const category =
    getListingCategory(
      item
    );

  const isCrayfish =
    category ===
    "crayfish";

  const isOwner =
    currentUser?.id ===
    item.seller_id;

  const quantity =
    Number(
      item.quantity || 0
    );

  const price =
    Number(
      item.price || 0
    );

  const total =
    Number(
      reserveQuantity || 0
    ) * price;

  return (
    <AppCard
      strong
      style={[
        styles.productCard,

        selected &&
          styles.productCardActive,
      ]}
    >
      <View
        style={
          styles.browseProductTop
        }
      >
        <ListingImage
          item={
            item
          }
          size={92} fullWidth
          colors={
            colors
          }
          styles={
            styles
          }
        />

        <View
          style={
            styles.browseProductContent
          }
        >
          <View
            style={
              styles.badgeRow
            }
          >
            <CategoryBadge
              category={
                category
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            {item.subcategory ? (
              <Text
                style={
                  styles.subcategoryText
                }
                numberOfLines={
                  1
                }
              >
                {
                  item.subcategory
                }
              </Text>
            ) : null}
          </View>

          <Text
            style={[
              styles.productTitle,
              styles.browseProductTitle,
            ]}
            numberOfLines={2}
          >
            {item.title ||
              "Marketplace Product"}
          </Text>

          <Text
            style={
              styles.productSubtitle
            }
            numberOfLines={1}
          >
            {isCrayfish
              ? [
                  formatFriendly(
                    item.stage
                  ),
                  item.size_label,
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " • "
                  )
              : [
                  item.brand,
                  formatFriendly(
                    item.product_condition
                  ),
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " • "
                  ) ||
                formatFriendly(
                  item.subcategory
                )}
          </Text>

          <Text
            style={[
              styles.productPrice,
              styles.browseProductPrice,
            ]}
          >
            {formatPeso(
              price
            )}

            <Text
              style={
                styles.priceUnit
              }
            >
              {" "}
              /{" "}
              {formatUnit(
                item.unit,
                1
              )}
            </Text>
          </Text>

          <View
            style={
              styles.metaRow
            }
          >
            <Ionicons
              name="layers-outline"
              size={13}
              color={
                colors.muted2
              }
            />

            <Text
              style={
                styles.metaText
              }
            >
              {quantity}{" "}
              {formatUnit(
                item.unit,
                quantity
              )}{" "}
              available
            </Text>
          </View>

          <View
            style={
              styles.metaRow
            }
          >
            <Ionicons
              name="location-outline"
              size={13}
              color={
                colors.muted2
              }
            />

            <Text
              style={
                styles.metaText
              }
              numberOfLines={1}
            >
              {getPickupLabel(
                item
              )}
            </Text>
          </View>
        </View>
      </View>

      {item.description ? (
        <Text
          style={
            styles.description
          }
          numberOfLines={
            selected
              ? 8
              : 2
          }
        >
          {
            item.description
          }
        </Text>
      ) : null}

      <View
        style={
          styles.productActions
        }
      >
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onDetails}
          accessibilityLabel="View product details"
        >
          <Ionicons name="information-circle-outline" size={15} color={colors.accent2} />
          <Text style={styles.secondaryButtonText}>Details</Text>
        </TouchableOpacity>
        {!isOwner ? (
          <TouchableOpacity
            style={
              styles.secondaryButton
            }
            onPress={
              onChatSeller
            }
          >
            <Ionicons
              name="chatbubble-outline"
              size={15}
              color={
                colors.accent2
              }
            />

            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Chat Seller
            </Text>
          </TouchableOpacity>
        ) : (
          <View
            style={
              styles.ownerBadge
            }
          >
            <Ionicons
              name="person-outline"
              size={13}
              color={
                colors.accent2
              }
            />

            <Text
              style={
                styles.ownerBadgeText
              }
            >
              Your Product
            </Text>
          </View>
        )}

        {!isOwner ? (
          <TouchableOpacity
            style={
              styles.primaryButton
            }
            onPress={
              onToggle
            }
          >
            <Ionicons
              name={
                selected
                  ? "chevron-up"
                  : "cart-outline"
              }
              size={15}
              color="#062C2B"
            />

            <Text
              style={
                styles.primaryButtonText
              }
            >
              {selected
                ? "Close"
                : "Reserve"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {selected &&
      !isOwner ? (
        <View
          style={
            styles.reserveBox
          }
        >
          <Text
            style={
              styles.reserveTitle
            }
          >
            Reserve Product
          </Text>

          <View
            style={
              styles.reserveRow
            }
          >
            <View
              style={
                styles.reserveField
              }
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Quantity
              </Text>

              <TextInput
                value={
                  reserveQuantity
                }
                onChangeText={(
                  value
                ) =>
                  setReserveQuantity(
                    digitsOnly(
                      value
                    )
                  )
                }
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor={
                  colors.inputPlaceholder
                }
                style={
                  styles.smallInput
                }
              />
            </View>

            <View
              style={
                styles.totalBox
              }
            >
              <Text
                style={
                  styles.fieldLabel
                }
              >
                Total
              </Text>

              <Text
                style={
                  styles.totalText
                }
              >
                {formatPeso(
                  total
                )}
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.fieldLabel
            }
          >
            Buyer Note
          </Text>

          <TextInput
            value={
              buyerNote
            }
            onChangeText={
              setBuyerNote
            }
            placeholder="Optional note for the seller"
            placeholderTextColor={
              colors.inputPlaceholder
            }
            multiline
            style={
              styles.noteInput
            }
          />

          <TouchableOpacity
            style={[
              styles.reserveButton,

              reserving &&
                styles.disabledButton,
            ]}
            onPress={
              onReserve
            }
            disabled={
              reserving
            }
          >
            {reserving ? (
              <ActivityIndicator
                size="small"
                color="#062C2B"
              />
            ) : (
              <Ionicons
                name="checkmark-circle-outline"
                size={17}
                color="#062C2B"
              />
            )}

            <Text
              style={
                styles.reserveButtonText
              }
            >
              {reserving
                ? "Sending..."
                : "Send Reservation"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </AppCard>
  );
}

function MyListingsTab({
  listings,
  loading,

  updatingListingId,
  deletingListingId,

  onAdd,
  onRefresh,

  onUpdateStatus,
  onDelete,

  colors,
  styles,
}) {
  return (
    <View>
      <SectionTitle
        title="My Listings"
        subtitle="Manage your Marketplace products"
        action={
          loading
            ? "Loading..."
            : "Refresh"
        }
        onActionPress={
          onRefresh
        }
        styles={
          styles
        }
      />

      <TouchableOpacity
        style={
          styles.addProductCard
        }
        onPress={
          onAdd
        }
        activeOpacity={
          0.86
        }
      >
        <View
          style={
            styles.addProductIcon
          }
        >
          <Ionicons
            name="add"
            size={24}
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.addProductContent
          }
        >
          <Text
            style={
              styles.addProductTitle
            }
          >
            Sell a Product
          </Text>

          <Text
            style={
              styles.addProductText
            }
          >
            Add crayfish, feeds,
            tanks, equipment,
            test kits or other
            supplies.
          </Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={18}
          color={
            colors.muted2
          }
        />
      </TouchableOpacity>

      {loading ? (
        <LoadingCard
          text="Loading your products..."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : listings.length ===
        0 ? (
        <EmptyState
          icon="albums-outline"
          title="No products yet"
          text="Create your first Marketplace listing."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : (
        <View
          style={
            styles.cardList
          }
        >
          {listings.map(
            (item) => (
              <MyListingCard
                key={
                  item.id
                }
                item={
                  item
                }
                updating={
                  updatingListingId ===
                  item.id
                }
                deleting={
                  deletingListingId ===
                  item.id
                }
                onUpdateStatus={
                  onUpdateStatus
                }
                onDelete={
                  onDelete
                }
                colors={
                  colors
                }
                styles={
                  styles
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

function MyListingCard({
  item,
  updating,
  deleting,

  onUpdateStatus,
  onDelete,

  colors,
  styles,
}) {
  const status =
    String(
      item.status ||
        "active"
    ).toLowerCase();

  const locked =
    !canOwnerModifyListing(
      item
    );

  return (
    <AppCard
      strong
      style={
        styles.ownerCard
      }
    >
      <View
        style={
          styles.productTop
        }
      >
        <ListingImage
          item={
            item
          }
          size={74}
          colors={
            colors
          }
          styles={
            styles
          }
        />

        <View
          style={
            styles.productContent
          }
        >
          <View
            style={
              styles.badgeRow
            }
          >
            <CategoryBadge
              category={
                getListingCategory(
                  item
                )
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <StatusBadge
              status={
                status
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          </View>

          <Text
            style={
              styles.productTitle
            }
            numberOfLines={2}
          >
            {
              item.title
            }
          </Text>

          <Text
            style={
              styles.productSubtitle
            }
            numberOfLines={1}
          >
            {getListingSubtitle(
              item
            )}
          </Text>

          <Text
            style={
              styles.productPrice
            }
          >
            {formatPeso(
              item.price
            )}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.ownerStats
        }
      >
        <MiniStat
          label="Stock"
          value={`${Number(
            item.quantity ||
              0
          )} ${formatUnit(
            item.unit,
            item.quantity
          )}`}
          styles={
            styles
          }
        />

        <MiniStat
          label="Pickup"
          value={
            item.pickup_municipality ||
            "Not set"
          }
          styles={
            styles
          }
        />
      </View>

      <View
        style={
          styles.productActions
        }
      >
        {!locked &&
        status ===
          "active" ? (
          <ActionButton
            label="Hide"
            icon="eye-off-outline"
            onPress={() =>
              onUpdateStatus(
                item,
                "hidden"
              )
            }
            loading={
              updating
            }
            colors={
              colors
            }
            styles={
              styles
            }
          />
        ) : null}

        {!locked &&
        [
          "hidden",
          "inactive",
        ].includes(
          status
        ) ? (
          <ActionButton
            label="Activate"
            icon="eye-outline"
            onPress={() =>
              onUpdateStatus(
                item,
                "active"
              )
            }
            loading={
              updating
            }
            colors={
              colors
            }
            styles={
              styles
            }
          />
        ) : null}

        {!locked ? (
          <ActionButton
            label="Remove"
            icon="trash-outline"
            onPress={() =>
              onDelete(
                item
              )
            }
            loading={
              deleting
            }
            danger
            colors={
              colors
            }
            styles={
              styles
            }
          />
        ) : (
          <View
            style={
              styles.lockedNote
            }
          >
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={
                colors.warning
              }
            />

            <Text
              style={
                styles.lockedNoteText
              }
            >
              Reserved/sold
              product is locked.
            </Text>
          </View>
        )}
      </View>
    </AppCard>
  );
}

function ChatsTab({
  threads,
  loading,

  onRefresh,
  onOpenChat,

  colors,
  styles,
}) {
  return (
    <View>
      <SectionTitle
        title="Private Chats"
        subtitle="Buyer and seller conversations"
        action={
          loading
            ? "Loading..."
            : "Refresh"
        }
        onActionPress={
          onRefresh
        }
        styles={
          styles
        }
      />

      {loading ? (
        <LoadingCard
          text="Loading chats..."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : threads.length ===
        0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No chats yet"
          text="Buyer and seller conversations will appear here."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : (
        <View
          style={
            styles.cardList
          }
        >
          {threads.map(
            (thread) => (
              <TouchableOpacity
                key={
                  thread.id
                }
                style={[
                  styles.chatCard,

                  thread.unreadCount >
                    0 &&
                    styles.chatUnread,
                ]}
                onPress={() =>
                  onOpenChat(
                    thread
                  )
                }
                activeOpacity={
                  0.86
                }
              >
                <View
                  style={
                    styles.chatAvatar
                  }
                >
                  {thread.otherProfile
                    ?.avatar_url ? (
                    <ResilientImage
                      source={{
                        uri:
                          thread
                            .otherProfile
                            .avatar_url,
                      }}
                      style={
                        styles.chatAvatarImage
                      }
                    />
                  ) : (
                    <Ionicons
                      name="person-outline"
                      size={22}
                      color={
                        colors.accent2
                      }
                    />
                  )}
                </View>

                <View
                  style={
                    styles.chatContent
                  }
                >
                  <View
                    style={
                      styles.chatTop
                    }
                  >
                    <Text
                      style={
                        styles.chatName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {getProfileName(
                        thread.otherProfile
                      )}
                    </Text>

                    <Text
                      style={
                        styles.chatDate
                      }
                    >
                      {formatDateShort(
                        thread.updated_at
                      )}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.chatListing
                    }
                    numberOfLines={
                      1
                    }
                  >
                    {thread.listing
                      ?.title ||
                      "Marketplace conversation"}
                  </Text>

                  <Text
                    style={
                      styles.chatPreview
                    }
                    numberOfLines={
                      1
                    }
                  >
                    {thread.last_message ||
                      "Tap to open conversation"}
                  </Text>
                </View>

                {thread.unreadCount >
                0 ? (
                  <View
                    style={
                      styles.unreadBadge
                    }
                  >
                    <Text
                      style={
                        styles.unreadBadgeText
                      }
                    >
                      {thread.unreadCount >
                      9
                        ? "9+"
                        : thread.unreadCount}
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={
                      colors.muted2
                    }
                  />
                )}
              </TouchableOpacity>
            )
          )}
        </View>
      )}
    </View>
  );
}

function SalesTab({
  orders,
  loading,

  onRefresh,
  onChatBuyer,

  colors,
  styles,
}) {
  return (
    <View>
      <SectionTitle
        title="Sales"
        subtitle="Reservation requests from buyers"
        action={
          loading
            ? "Loading..."
            : "Refresh"
        }
        onActionPress={
          onRefresh
        }
        styles={
          styles
        }
      />

      {loading ? (
        <LoadingCard
          text="Loading sales..."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : orders.length ===
        0 ? (
        <EmptyState
          icon="bag-check-outline"
          title="No buyer orders yet"
          text="Buyer reservations will appear here."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : (
        <View
          style={
            styles.cardList
          }
        >
          {orders.map(
            (order) => (
              <OrderCard
                key={
                  order.id
                }
                order={
                  order
                }
                profile={
                  order.buyer
                }
                roleLabel="Buyer"
                onChat={() =>
                  onChatBuyer(
                    order
                  )
                }
                colors={
                  colors
                }
                styles={
                  styles
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

function ReservationsTab({
  reservations,
  loading,

  updatingOrderId,

  onRefresh,
  onCancel,
  onChatSeller,

  colors,
  styles,
}) {
  return (
    <View>
      <SectionTitle
        title="My Orders"
        subtitle="Products you have reserved"
        action={
          loading
            ? "Loading..."
            : "Refresh"
        }
        onActionPress={
          onRefresh
        }
        styles={
          styles
        }
      />

      {loading ? (
        <LoadingCard
          text="Loading orders..."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : reservations.length ===
        0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No orders yet"
          text="Products you reserve will appear here."
          colors={
            colors
          }
          styles={
            styles
          }
        />
      ) : (
        <View
          style={
            styles.cardList
          }
        >
          {reservations.map(
            (order) => (
              <OrderCard
                key={
                  order.id
                }
                order={
                  order
                }
                roleLabel="Seller"
                onChat={() =>
                  onChatSeller(
                    order
                  )
                }
                onCancel={
                  canCancelOrder(
                    order
                  )
                    ? () =>
                        onCancel(
                          order
                        )
                    : undefined
                }
                updating={
                  updatingOrderId ===
                  order.id
                }
                colors={
                  colors
                }
                styles={
                  styles
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );
}

function OrderCard({
  order,
  profile,

  roleLabel,

  onChat,
  onCancel,

  updating,

  colors,
  styles,
}) {
  const listing =
    order.listing || {};

  const status =
    String(
      order.status ||
        "pending"
    ).toLowerCase();

  return (
    <AppCard
      strong
      style={
        styles.orderCard
      }
    >
      <View
        style={
          styles.productTop
        }
      >
        <ListingImage
          item={
            listing
          }
          size={66}
          colors={
            colors
          }
          styles={
            styles
          }
        />

        <View
          style={
            styles.productContent
          }
        >
          <View
            style={
              styles.badgeRow
            }
          >
            <CategoryBadge
              category={
                getListingCategory(
                  listing
                )
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <StatusBadge
              status={
                status
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          </View>

          <Text
            style={
              styles.productTitle
            }
            numberOfLines={2}
          >
            {listing.title ||
              "Marketplace Product"}
          </Text>

          <Text
            style={
              styles.orderPerson
            }
            numberOfLines={1}
          >
            {roleLabel}:{" "}
            {profile
              ? getProfileName(
                  profile
                )
              : roleLabel}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.orderGrid
        }
      >
        <MiniStat
          label="Quantity"
          value={String(
            order.quantity ||
              1
          )}
          styles={
            styles
          }
        />

        <MiniStat
          label="Total"
          value={formatPeso(
            order.total_price
          )}
          styles={
            styles
          }
        />

        <MiniStat
          label="Date"
          value={formatDateShort(
            order.created_at
          )}
          styles={
            styles
          }
        />
      </View>

      {order.buyer_note ? (
        <View
          style={
            styles.orderNote
          }
        >
          <Ionicons
            name="document-text-outline"
            size={14}
            color={
              colors.accent2
            }
          />

          <Text
            style={
              styles.orderNoteText
            }
          >
            {
              order.buyer_note
            }
          </Text>
        </View>
      ) : null}

      <View
        style={
          styles.productActions
        }
      >
        <ActionButton
          label={`Chat ${roleLabel}`}
          icon="chatbubble-outline"
          onPress={
            onChat
          }
          colors={
            colors
          }
          styles={
            styles
          }
        />

        {onCancel ? (
          <ActionButton
            label="Cancel"
            icon="close-circle-outline"
            onPress={
              onCancel
            }
            loading={
              updating
            }
            danger
            colors={
              colors
            }
            styles={
              styles
            }
          />
        ) : null}
      </View>
    </AppCard>
  );
}

function ListingImage({
  item,
  size,
  fullWidth = false,
  colors,
  styles
}) {
  return <View style={[styles.productImageWrap, fullWidth && styles.browseImageWrap, fullWidth ? {width: "100%", aspectRatio: 1.8} : {
    width: size,
    height: size
  }]}>
      {item?.image_url ? <ResilientImage source={{
      uri: item.image_url
    }} style={styles.productImage} /> : getListingCategory(item) === "crayfish" ? <CrayfishIcon size={Math.max(28, size * 0.42)} color={colors.accent2} /> : <Ionicons name={getCategoryIcon(getListingCategory(item))} size={Math.max(25, size * 0.36)} color={colors.accent2} />}
    </View>;
}

function CategoryBadge({
  category,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.categoryBadge
      }
    >
      <Ionicons
        name={getCategoryIcon(
          category
        )}
        size={11}
        color={
          colors.accent2
        }
      />

      <Text
        style={
          styles.categoryBadgeText
        }
      >
        {getCategoryLabel(
          category
        )}
      </Text>
    </View>
  );
}

function StatusBadge({
  status,
  colors,
  styles,
}) {
  const tone =
    getStatusTone(
      status,
      colors
    );

  return (
    <View
      style={[
        styles.statusBadge,

        {
          backgroundColor:
            tone.background,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,

          {
            color:
              tone.text,
          },
        ]}
      >
        {formatFriendly(
          status
        )}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  styles,
}) {
  return (
    <View
      style={
        styles.miniStat
      }
    >
      <Text
        style={
          styles.miniStatLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.miniStatValue
        }
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,

  onPress,
  loading,

  danger,

  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,

        danger &&
          styles.actionButtonDanger,
      ]}
      onPress={
        onPress
      }
      disabled={
        loading
      }
      activeOpacity={
        0.84
      }
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            danger
              ? colors.danger
              : colors.accent2
          }
        />
      ) : (
        <Ionicons
          name={
            icon
          }
          size={15}
          color={
            danger
              ? colors.danger
              : colors.accent2
          }
        />
      )}

      <Text
        style={[
          styles.actionButtonText,

          danger &&
            styles.actionButtonTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionTitle({
  title,
  subtitle,

  action,
  onActionPress,

  styles,
}) {
  return (
    <View
      style={
        styles.sectionHeader
      }
    >
      <View
        style={
          styles.sectionHeaderContent
        }
      >
        <Text
          style={
            styles.sectionTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.sectionSubtitle
          }
        >
          {subtitle}
        </Text>
      </View>

      {action ? (
        <TouchableOpacity
          onPress={
            onActionPress
          }
          disabled={
            !onActionPress
          }
        >
          <Text
            style={
              styles.sectionAction
            }
          >
            {action}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MessageBox({
  type,
  message,

  colors,
  styles,
}) {
  const success =
    type === "success";

  return (
    <View
      style={[
        styles.messageBox,

        success
          ? styles.messageSuccess
          : styles.messageError,
      ]}
    >
      <Ionicons
        name={
          success
            ? "checkmark-circle-outline"
            : "alert-circle-outline"
        }
        size={18}
        color={
          success
            ? colors.success
            : colors.danger
        }
      />

      <Text
        style={
          styles.messageText
        }
      >
        {message}
      </Text>
    </View>
  );
}

function LoadingCard({
  text,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.stateCard
      }
    >
      <ActivityIndicator
        color={
          colors.accent2
        }
      />

      <Text
        style={
          styles.stateTitle
        }
      >
        Loading
      </Text>

      <Text
        style={
          styles.stateText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  text,

  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.stateCard
      }
    >
      <View
        style={
          styles.stateIcon
        }
      >
        <Ionicons
          name={
            icon
          }
          size={26}
          color={
            colors.accent2
          }
        />
      </View>

      <Text
        style={
          styles.stateTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.stateText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function getListingCategory(
  item
) {
  return String(
    item?.category ||
      "crayfish"
  )
    .trim()
    .toLowerCase();
}

function getCategoryLabel(
  value
) {
  return (
    CATEGORY_FILTERS.find(
      (item) =>
        item.value ===
        value
    )?.label ||
    "Other"
  );
}

function getCategoryIcon(
  value
) {
  return (
    CATEGORY_FILTERS.find(
      (item) =>
        item.value ===
        value
    )?.icon ||
    "cube-outline"
  );
}

function getListingSubtitle(
  item
) {
  const category =
    getListingCategory(
      item
    );

  if (
    category ===
    "crayfish"
  ) {
    return [
      item.crayfish_type,

      formatFriendly(
        item.stage
      ),

      item.size_label,
    ]
      .filter(Boolean)
      .join(" • ");
  }

  return [
    item.subcategory,
    item.brand,

    formatFriendly(
      item.product_condition
    ),
  ]
    .filter(Boolean)
    .join(" • ");
}

function getPickupLabel(
  item
) {
  const parts = [
    item?.pickup_barangay,
    item?.pickup_municipality,
  ].filter(Boolean);

  return (
    parts.join(", ") ||
    item?.location ||
    "Pickup location not set"
  );
}

function formatPeso(
  value
) {
  const number =
    Number(
      value || 0
    );

  return new Intl.NumberFormat(
    "en-PH",
    {
      style:
        "currency",

      currency:
        "PHP",

      minimumFractionDigits:
        Number.isInteger(
          number
        )
          ? 0
          : 2,
    }
  ).format(
    Number.isFinite(
      number
    )
      ? number
      : 0
  );
}

function formatFriendly(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  if (!text) {
    return "N/A";
  }

  return text
    .replace(
      /_/g,
      " "
    )
    .replace(
      /-/g,
      " "
    )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function formatUnit(
  value,
  quantity = 1
) {
  const unit =
    String(
      value ||
        "piece"
    )
      .trim()
      .toLowerCase();

  const labels = {
    piece:
      quantity === 1
        ? "piece"
        : "pieces",

    set:
      quantity === 1
        ? "set"
        : "sets",

    pack:
      quantity === 1
        ? "pack"
        : "packs",

    bag:
      quantity === 1
        ? "bag"
        : "bags",

    box:
      quantity === 1
        ? "box"
        : "boxes",

    kg: "kg",

    gram:
      quantity === 1
        ? "gram"
        : "grams",

    liter:
      quantity === 1
        ? "liter"
        : "liters",
  };

  return (
    labels[unit] ||
    formatFriendly(
      unit
    )
  );
}

function formatDateShort(
  value
) {
  return formatPhilippineDate(value, { year: 'numeric' }, 'No date');
}

function getProfileName(
  profile
) {
  return (
    profile?.username ||
    profile?.full_name ||
    "Marketplace User"
  );
}

function getStatusTone(
  status,
  colors
) {
  const value =
    String(
      status || ""
    ).toLowerCase();

  if (
    [
      "completed",
      "sold",
      "paid",
    ].includes(
      value
    )
  ) {
    return {
      background:
        colors.successSoft,

      text:
        colors.success,
    };
  }

  if (
    [
      "cancelled",
      "canceled",
      "deleted",
    ].includes(
      value
    )
  ) {
    return {
      background:
        colors.dangerSoft,

      text:
        colors.danger,
    };
  }

  if (
    [
      "pending",
      "reserved",
    ].includes(
      value
    )
  ) {
    return {
      background:
        colors.warningSoft,

      text:
        colors.warning,
    };
  }

  return {
    background:
      colors.accentSoft,

    text:
      colors.accent2,
  };
}

function canOwnerModifyListing(listing) {
  return ["active", "hidden", "inactive"].includes(String(listing?.status || "active").toLowerCase());
}

function canCancelOrder(
  order
) {
  return [
    "pending",
    "confirmed",
  ].includes(
    String(
      order?.status ||
        "pending"
    ).toLowerCase()
  );
}

function confirmAction(
  title,
  message,
  onConfirm,
  destructive = false
) {
  if (
    Platform.OS ===
    "web"
  ) {
    const confirmed =
      typeof window ===
      "undefined"
        ? true
        : window.confirm(
            message
          );

    if (
      confirmed
    ) {
      onConfirm?.();
    }

    return;
  }

  Alert.alert(
    title,
    message,
    [
      {
        text: "Cancel",
        style: "cancel",
      },

      {
        text:
          destructive
            ? "Continue"
            : "Yes",

        style:
          destructive
            ? "destructive"
            : "default",

        onPress:
          onConfirm,
      },
    ]
  );
}

function digitsOnly(
  value
) {
  return String(
    value || ""
  ).replace(
    /[^0-9]/g,
    ""
  );
}

function capitalize(
  value
) {
  const text =
    String(
      value || ""
    );

  return text
    ? text
        .charAt(0)
        .toUpperCase() +
        text.slice(1)
    : "";
}

function useThemePack() {
  const theme =
    useAppTheme();

  const isDark =
    theme?.isDark ??
    true;

  const colors =
    useMemo(
      () =>
        normalizeColors(
          theme?.colors ||
            COLORS,

          isDark
        ),
      [
        theme?.colors,
        isDark,
      ]
    );

  const styles =
    useMemo(
      () =>
        makeStyles(
          colors
        ),
      [
        colors,
      ]
    );

  return {
    colors,
    styles,
  };
}

function normalizeColors(
  source,
  isDark
) {
  return {
    ...COLORS,
    ...source,

    background:
      source.background ||
      (isDark
        ? COLORS.deep
        : "#F3FFFC"),

    surface:
      source.surface ||
      (isDark
        ? COLORS.surface
        : "#FFFFFF"),

    surfaceStrong:
      source.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "#FFFFFF"),

    surfaceSoft:
      source.surfaceSoft ||
      (isDark
        ? COLORS.surfaceSoft
        : "rgba(8,31,48,0.045)"),

    textStrong:
      source.textStrong ||
      (isDark
        ? COLORS.white
        : "#0F172A"),

    muted:
      source.muted ||
      (isDark
        ? COLORS.muted
        : "rgba(15,23,42,0.68)"),

    muted2:
      source.muted2 ||
      (isDark
        ? COLORS.muted2
        : "rgba(15,23,42,0.46)"),

    border:
      source.border ||
      (isDark
        ? COLORS.border
        : "rgba(15,23,42,0.10)"),

    accent2:
      source.accent2 ||
      COLORS.accent2,

    accentSoft:
      source.accentSoft ||
      (isDark
        ? COLORS.accentSoft
        : "rgba(34,211,197,0.13)"),

    accentBorder:
      source.accentBorder ||
      (isDark
        ? COLORS.accentBorder
        : "rgba(15,118,110,0.18)"),

    danger:
      source.danger ||
      COLORS.danger,

    dangerSoft:
      source.dangerSoft ||
      (isDark
        ? COLORS.dangerSoft
        : "rgba(248,113,113,0.12)"),

    success:
      source.success ||
      COLORS.success,

    successSoft:
      source.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.14)"),

    warning:
      source.warning ||
      COLORS.warning,

    warningSoft:
      source.warningSoft ||
      (isDark
        ? COLORS.warningSoft
        : "rgba(251,191,36,0.14)"),

    inputPlaceholder:
      isDark
        ? "rgba(255,255,255,0.34)"
        : "rgba(15,23,42,0.36)",
  };
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 16
    },
    scroll: {
      paddingTop: 3,
      paddingBottom: 150
    },
    cardList: {
      gap: 11
    },
    summaryCard: {
      padding: 8,
      borderRadius: 18,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryStats: {
      flexDirection: 'row',
      gap: 4,
    },
    summaryStat: {
      flex: 1,
      minWidth: 0,
      minHeight: 52,
      paddingVertical: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryValue: {
      color: colors.textStrong,
      fontSize: 20,
      fontWeight: '800',
    },
    summaryLabel: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
    },
    messageBox: {
      marginTop: 11,
      padding: 11,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1
    },
    messageSuccess: {
      backgroundColor: colors.successSoft,
      borderColor: "rgba(74,222,128,0.22)"
    },
    messageError: {
      backgroundColor: colors.dangerSoft,
      borderColor: "rgba(248,113,113,0.22)"
    },
    messageText: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 12,
      lineHeight: 18
    },
    segmentWrap: {
      marginVertical: 14,
    },
    segment: {
      flexDirection: 'row',
      padding: 4,
      gap: 2,
      borderRadius: 18,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentButton: {
      flex: 1,
      minWidth: 0,
      minHeight: 58,
      paddingHorizontal: 2,
      paddingVertical: 8,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    segmentActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accentBorder,
    },
    segmentText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    segmentTextActive: {
      color: colors.textStrong,
      fontWeight: '800',
    },
    tabBadge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 18,
      minHeight: 18,
      paddingHorizontal: 3,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
    },
    tabBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    searchBox: {
      minHeight: 50,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 12,
      color: colors.textStrong,
      fontSize: 14,
    },
    searchClear: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterHeading: {
      minHeight: 44,
      marginTop: 6,
      marginBottom: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filterLabel: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: '700',
    },
    filterReset: {
      minHeight: 44,
      paddingLeft: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    filterResetText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: '600',
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryTile: {
      flexBasis: '30%',
      flexGrow: 1,
      minWidth: 0,
      minHeight: 68,
      paddingHorizontal: 6,
      paddingVertical: 9,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryTileActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent2,
    },
    categoryIcon: {
      minHeight: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryIconActive: {
      transform: [{ scale: 1.05 }],
    },
    categorySelectedMark: {
      position: 'absolute',
      top: 5,
      right: 5,
    },
    categoryTileText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    categoryTileTextActive: {
      color: colors.textStrong,
      fontWeight: '800',
    },
    stageSection: {
      marginTop: 14,
      padding: 10,
      borderRadius: 14,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stageLabel: {
      marginBottom: 8,
      color: colors.muted,
      fontSize: 12,
      fontWeight: '600',
    },
    stageRow: {
      flexDirection: 'row',
      gap: 6,
    },
    filterChip: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: 3,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accentBorder,
    },
    filterChipText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
      fontWeight: '600',
    },
    filterChipTextActive: {
      color: colors.textStrong,
      fontWeight: '800',
    },
    sectionHeader: {
      marginTop: 21,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12
    },
    sectionHeaderContent: {
      flex: 1
    },
    sectionTitle: {
      color: colors.textStrong,
      fontSize: 15.5,
      fontWeight: "700",
      flexShrink: 1
    },
    sectionSubtitle: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12
    },
    sectionAction: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    productCard: {
      padding: 13,
      borderRadius: 18,
      backgroundColor: colors.background2,
      borderColor: colors.border
    },
    productCardActive: {
      borderColor: colors.accentBorder
    },
    productTop: {
      flexDirection: "row",
      alignItems: "flex-start"
    },
    productImageWrap: {
      flexShrink: 0,
      borderRadius: 16,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.border
    },
    productImage: {
      width: "100%",
      height: "100%"
    },
    productContent: {
      flex: 1,
      minWidth: 0
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap"
    },
    categoryBadge: {
      minHeight: 22,
      paddingHorizontal: 7,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    categoryBadgeText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    subcategoryText: {
      flexShrink: 1,
      color: colors.muted2,
      fontSize: 12
    },
    productTitle: {
      marginTop: 6,
      color: colors.textStrong,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "700"
    },
    productSubtitle: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12
    },
    productPrice: {
      marginTop: 7,
      color: colors.accent2,
      fontSize: 15,
      fontWeight: "800"
    },
    priceUnit: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    metaRow: {
      marginTop: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 5
    },
    metaText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12
    },
    description: {
      marginTop: 10,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    productActions: {
      marginTop: 11,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8
    },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 11,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8,
      flexGrow: 1,
      flexBasis: "44%"
    },
    secondaryButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    primaryButton: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.accent,
      paddingVertical: 8,
      width: "100%"
    },
    primaryButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "700"
    },
    ownerBadge: {
      minHeight: 35,
      paddingHorizontal: 10,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accentSoft
    },
    ownerBadgeText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    reserveBox: {
      marginTop: 12,
      padding: 12,
      borderRadius: 15,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    reserveTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    reserveRow: {
      marginTop: 11,
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap"
    },
    reserveField: {
      flex: 1,
      minWidth: 120
    },
    totalBox: {
      flex: 1,
      minWidth: 120
    },
    fieldLabel: {
      marginBottom: 6,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "600"
    },
    smallInput: {
      minHeight: 43,
      paddingHorizontal: 11,
      borderRadius: 12,
      color: colors.textStrong,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14
    },
    totalText: {
      minHeight: 43,
      paddingTop: 11,
      color: colors.accent2,
      fontSize: 14,
      fontWeight: "800"
    },
    noteInput: {
      minHeight: 72,
      padding: 11,
      borderRadius: 12,
      color: colors.textStrong,
      textAlignVertical: "top",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14
    },
    reserveButton: {
      minHeight: 44,
      marginTop: 10,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.accent2,
      paddingVertical: 8
    },
    reserveButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "700"
    },
    disabledButton: {
      opacity: 0.6,
      minHeight: 44,
      paddingVertical: 8
    },
    addProductCard: {
      minHeight: 76,
      padding: 12,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    addProductIcon: {
      width: 43,
      height: 43,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.surfaceSoft
    },
    addProductContent: {
      flex: 1,
      minWidth: 0
    },
    addProductTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    addProductText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    ownerCard: {
      padding: 13,
      borderRadius: 18
    },
    ownerStats: {
      marginTop: 11,
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      rowGap: 8
    },
    miniStat: {
      flex: 1,
      minWidth: 80,
      padding: 9,
      borderRadius: 11,
      backgroundColor: colors.surfaceSoft
    },
    miniStatLabel: {
      color: colors.muted2,
      fontSize: 12
    },
    miniStatValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    actionButton: {
      minHeight: 44,
      paddingHorizontal: 10,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8
    },
    actionButtonDanger: { minHeight: 44,
      backgroundColor: colors.dangerSoft,
      borderColor: "rgba(248,113,113,0.18)"
    },
    actionButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    actionButtonTextDanger: {
      color: colors.danger
    },
    lockedNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8
    },
    lockedNoteText: {
      color: colors.warning,
      fontSize: 12,
      flexShrink: 1
    },
    statusBadge: {
      minHeight: 22,
      paddingHorizontal: 7,
      borderRadius: RADIUS.pill,
      justifyContent: "center"
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: "700"
    },
    chatCard: {
      minHeight: 78,
      padding: 11,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    chatUnread: { minHeight: 44,
      borderColor: colors.accentBorder,
      backgroundColor: colors.accentSoft
    },
    chatAvatar: {
      width: 47,
      height: 47,
      borderRadius: 15,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    chatAvatarImage: {
      width: "100%",
      height: "100%"
    },
    chatContent: {
      flex: 1,
      minWidth: 0
    },
    chatTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    },
    chatName: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    chatDate: {
      color: colors.muted2,
      fontSize: 12
    },
    chatListing: {
      marginTop: 3,
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600"
    },
    chatPreview: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12
    },
    unreadBadge: {
      minWidth: 23,
      height: 23,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
      backgroundColor: colors.accent2
    },
    unreadBadgeText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "800"
    },
    orderCard: {
      padding: 13,
      borderRadius: 18
    },
    orderPerson: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12
    },
    orderGrid: {
      marginTop: 11,
      flexDirection: "row",
      gap: 7,
      flexWrap: "wrap",
      rowGap: 8
    },
    orderNote: {
      marginTop: 9,
      padding: 9,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      backgroundColor: colors.surfaceSoft
    },
    orderNoteText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    stateCard: {
      minHeight: 210,
      padding: 22,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border
    },
    stateIcon: {
      width: 48,
      height: 48,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft
    },
    stateTitle: {
      marginTop: 9,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    stateText: {
      marginTop: 4,
      maxWidth: 290,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center"
    },
    browseProductTop: {
      width: "100%"
    },
    browseImageWrap: {
      marginRight: 0,
      marginBottom: 14
    },
    browseProductContent: {
      width: "100%",
      minWidth: 0
    },
    browseProductTitle: {
      fontSize: 18,
      lineHeight: 24
    },
    browseProductPrice: {
      fontSize: 22,
      lineHeight: 29
    }
  });
}

async function getListingMap(
    ids = []
  ) {
    const unique = [
      ...new Set(
        ids.filter(Boolean)
      ),
    ];

    if (
      !unique.length
    ) {
      return {};
    }

    const {
      data,
      error,
    } = await supabase
      .from("marketplace_listings")
      .select("*")
      .in(
        "id",
        unique
      );

    if (error) {
      console.log("GET LISTING MAP ERROR:");

      return {};
    }

    return (
      data || []
    ).reduce(
      (map, item) => {
        map[item.id] =
          item;

        return map;
      },
      {}
    );
  }


async function getOrderMap(
    ids = []
  ) {
    const unique = [
      ...new Set(
        ids.filter(Boolean)
      ),
    ];

    if (
      !unique.length
    ) {
      return {};
    }

    const {
      data,
      error,
    } = await supabase
      .from("marketplace_orders")
      .select("*")
      .in(
        "id",
        unique
      );

    if (error) {
      console.log("GET ORDER MAP ERROR:");

      return {};
    }

    return (
      data || []
    ).reduce(
      (map, item) => {
        map[item.id] =
          item;

        return map;
      },
      {}
    );
  }


async function getProfileMap(
    ids = []
  ) {
    const unique = [
      ...new Set(
        ids.filter(Boolean)
      ),
    ];

    if (
      !unique.length
    ) {
      return {};
    }

    const {
      data,
      error,
    } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url"
      )
      .in(
        "id",
        unique
      );

    if (error) {
      console.log("GET PROFILE MAP ERROR:");

      return {};
    }

    return (
      data || []
    ).reduce(
      (map, item) => {
        map[item.id] =
          item;

        return map;
      },
      {}
    );
  }


async function getUnreadMap(
    threadIds = [],
    userId
  ) {
    const unique = [
      ...new Set(
        threadIds.filter(
          Boolean
        )
      ),
    ];

    if (
      !unique.length ||
      !userId
    ) {
      return {};
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketplace_chat_messages"
      )
      .select("thread_id")
      .in(
        "thread_id",
        unique
      )
      .eq(
        "receiver_id",
        userId
      )
      .eq(
        "is_read",
        false
      );

    if (error) {
      console.log("GET UNREAD ERROR:");

      return {};
    }

    return (
      data || []
    ).reduce(
      (map, row) => {
        map[row.thread_id] =
          Number(
            map[
              row.thread_id
            ] || 0
          ) + 1;

        return map;
      },
      {}
    );
  }
