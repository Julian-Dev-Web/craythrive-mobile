import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../../components/icons/CrayfishIcon";
import AppButton from "../../../components/ui/AppButton";
import AppCard from "../../../components/ui/AppCard";
import AppHeader from "../../../components/ui/AppHeader";
import AppScreen from "../../../components/ui/AppScreen";

import {
  SHADOW,
} from "../../../constants/theme";

import { supabase } from "../../../lib/supabase";
import { normalizeStoreUrl } from "../../../lib/marketplace";
import { useAppTheme } from "../../../context/ThemeContext";

/* =========================================================
   CONFIG
========================================================= */

const PSGC_BASE_URL =
  "https://psgc.cloud/api/v2";

const BULACAN_PROVINCE_NAME =
  "Bulacan";

const BULACAN_FALLBACK_LOCALITIES = [
  {
    name: "Angat",
    code: "Angat",
    type: "municipality",
  },
  {
    name: "Balagtas",
    code: "Balagtas",
    type: "municipality",
  },
  {
    name: "Baliwag",
    code: "Baliwag",
    type: "city",
  },
  {
    name: "Bocaue",
    code: "Bocaue",
    type: "municipality",
  },
  {
    name: "Bulakan",
    code: "Bulakan",
    type: "municipality",
  },
  {
    name: "Bustos",
    code: "Bustos",
    type: "municipality",
  },
  {
    name: "Calumpit",
    code: "Calumpit",
    type: "municipality",
  },
  {
    name: "Do?a Remedios Trinidad",
    code: "Do?a Remedios Trinidad",
    type: "municipality",
  },
  {
    name: "Guiguinto",
    code: "Guiguinto",
    type: "municipality",
  },
  {
    name: "Hagonoy",
    code: "Hagonoy",
    type: "municipality",
  },
  {
    name: "City of Malolos",
    code: "City of Malolos",
    type: "city",
  },
  {
    name: "Marilao",
    code: "Marilao",
    type: "municipality",
  },
  {
    name: "City of Meycauayan",
    code: "City of Meycauayan",
    type: "city",
  },
  {
    name: "Norzagaray",
    code: "Norzagaray",
    type: "municipality",
  },
  {
    name: "Obando",
    code: "Obando",
    type: "municipality",
  },
  {
    name: "Pandi",
    code: "Pandi",
    type: "municipality",
  },
  {
    name: "Paombong",
    code: "Paombong",
    type: "municipality",
  },
  {
    name: "Plaridel",
    code: "Plaridel",
    type: "municipality",
  },
  {
    name: "Pulilan",
    code: "Pulilan",
    type: "municipality",
  },
  {
    name: "San Ildefonso",
    code: "San Ildefonso",
    type: "municipality",
  },
  {
    name: "City of San Jose del Monte",
    code: "City of San Jose del Monte",
    type: "city",
  },
  {
    name: "San Miguel",
    code: "San Miguel",
    type: "municipality",
  },
  {
    name: "San Rafael",
    code: "San Rafael",
    type: "municipality",
  },
  {
    name: "Santa Maria",
    code: "Santa Maria",
    type: "municipality",
  },
];

const EMPTY_FORM = {
  store_name: "",
  store_description: "",

  seller_mobile: "",

  pickup_municipality: "",
  pickup_municipality_code: "",

  pickup_barangay: "",
  pickup_barangay_code: "",

  pickup_note: "",

  shopee_url: "",
  lazada_url: "",
  facebook_url: "",
  tiktok_url: "",
  website_url: "",

  is_active: true,
};

/* =========================================================
   PAGE
========================================================= */

export default function SellerProfileScreen({
  onBack,
}) {
  const { colors, styles } = useThemePack();
  const saveLock = useRef(false);
  const barangayRequest = useRef(0);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [
    userId,
    setUserId,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    username,
    setUsername,
  ] = useState(
    "CrayThrive User"
  );

  const [
    form,
    setForm,
  ] = useState(
    EMPTY_FORM
  );

  const [
    localities,
    setLocalities,
  ] = useState([]);

  const [
    barangays,
    setBarangays,
  ] = useState([]);

  const [
    municipalityOpen,
    setMunicipalityOpen,
  ] = useState(false);

  const [
    barangayOpen,
    setBarangayOpen,
  ] = useState(false);

  const [
    focusedField,
    setFocusedField,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadingLocalities,
    setLoadingLocalities,
  ] = useState(false);

  const [
    loadingBarangays,
    setLoadingBarangays,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    statusText,
    setStatusText,
  ] = useState("");

  const [
    errorText,
    setErrorText,
  ] = useState("");

  /* =======================================================
     INITIAL LOAD
  ======================================================= */



  

  

  const hasSelectedMunicipality =
    Boolean(
      form.pickup_municipality_code ||
        form.pickup_municipality
    );

  /* =======================================================
     FORM
  ======================================================= */

  function updateForm(
    key,
    value
  ) {
    setErrorText("");

    setForm(
      (previous) => ({
        ...previous,
        [key]: value,
      })
    );
  }

  function showError(
    title,
    message
  ) {
    setErrorText(
      message || title
    );

    if (
      Platform.OS !== "web"
    ) {
      Alert.alert(
        title,
        message
      );
    }
  }

  function showNotice(
    title,
    message,
    onPress
  ) {
    if (
      Platform.OS === "web"
    ) {
      if (
        typeof window !==
        "undefined"
      ) {
        window.alert(
          `${title}\n\n${message}`
        );
      }

      onPress?.();

      return;
    }

    Alert.alert(
      title,
      message,
      [
        {
          text: "OK",
          onPress,
        },
      ]
    );
  }

  /* =======================================================
     LOAD PROFILE
  ======================================================= */

  

  /* =======================================================
     LOCATION
  ======================================================= */

  const loadBulacanLocalities = useCallback(async () => {
    setLoadingLocalities(
      true
    );

    try {
      const provinceName =
        encodeURIComponent(
          BULACAN_PROVINCE_NAME
        );

      const url =
        `${PSGC_BASE_URL}/provinces/${provinceName}/cities-municipalities`;

      const response =
        await fetch(url);

      if (
        !response.ok
      ) {
        throw new Error(
          "Unable to load Bulacan locations."
        );
      }

      const json =
        await response.json();

      const rows =
        normalizeApiList(
          json
        );

      const mapped =
        rows
          .map(
            (item) => ({
              name:
                item.name ||
                item.area_name ||
                "Unknown",

              code:
                item.code ||
                item.psgc_code ||
                item.id ||
                item.name,

              type:
                item.type ||
                inferLocalityType(
                  item.name ||
                    item.area_name
                ),
            })
          )
          .filter(
            (item) =>
              item.name &&
              item.code
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          );

      setLocalities(
        mapped.length > 0
          ? mapped
          : BULACAN_FALLBACK_LOCALITIES
      );
    } catch (
      _error
    ) {
      console.log("LOAD SELLER BULACAN LOCALITIES ERROR:");

      setLocalities(
        BULACAN_FALLBACK_LOCALITIES
      );
    } finally {
      setLoadingLocalities(
        false
      );
    }
  }, []);

  const loadBarangaysForLocality = useCallback(async (
    locality,
    options = {}
  ) => {
    if (
      !locality?.code
    ) {
      return;
    }

    const requestId = ++barangayRequest.current;
    const preserveBarangay =
      Boolean(
        options.preserveBarangay
      );

    setBarangays([]);
    setLoadingBarangays(
      true
    );

    setBarangayOpen(
      false
    );

    setForm(
      (previous) => ({
        ...previous,

        pickup_municipality:
          locality.name,

        pickup_municipality_code:
          locality.code,

        ...(preserveBarangay
          ? {}
          : {
              pickup_barangay:
                "",

              pickup_barangay_code:
                "",
            }),
      })
    );

    try {
      const localityKey =
        encodeURIComponent(
          locality.code ||
            locality.name
        );

      const url =
        `${PSGC_BASE_URL}/cities-municipalities/${localityKey}/barangays`;

      const response =
        await fetch(url);

      if (
        !response.ok
      ) {
        throw new Error(
          "Unable to load barangays."
        );
      }

      const json =
        await response.json();

      const rows =
        normalizeApiList(
          json
        );

      const mapped =
        rows
          .map(
            (item) => ({
              name:
                item.name ||
                item.area_name ||
                "Unknown",

              code:
                item.code ||
                item.psgc_code ||
                item.id ||
                item.name,
            })
          )
          .filter(
            (item) =>
              item.name &&
              item.code
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          );

      if (requestId !== barangayRequest.current) return;
      setBarangays(mapped);
    } catch (
      _error
    ) {
      console.log("LOAD SELLER BARANGAYS ERROR:");

      if (requestId === barangayRequest.current) {
        setErrorText("Unable to load barangays for this location.");
      }
    } finally {
      if (requestId === barangayRequest.current) setLoadingBarangays(false);
    }
  }, []);

  function selectMunicipality(
    item
  ) {
    setMunicipalityOpen(
      false
    );

    setBarangayOpen(
      false
    );

    loadBarangaysForLocality(
      item
    );
  }

  function selectBarangay(
    item
  ) {
    setForm(
      (previous) => ({
        ...previous,

        pickup_barangay:
          item.name,

        pickup_barangay_code:
          item.code,
      })
    );

    setErrorText("");

    setBarangayOpen(
      false
    );
  }

  /* =======================================================
     VALIDATION
  ======================================================= */

  const loadSellerProfile = useCallback(async () => {
    setLoading(true);
    setProfileLoaded(false);
    setErrorText("");

    try {
      const {
        data: userData,
        error: userError,
      } =
        await supabase
          .auth
          .getUser();

      if (
        userError
      ) {
        throw new Error(
          userError.message ||
            "Unable to load account."
        );
      }

      const user =
        userData?.user;

      if (
        !user?.id
      ) {
        throw new Error(
          "No logged in user found. Please sign in again."
        );
      }

      const meta =
        user.user_metadata ||
        {};

      setUserId(
        user.id
      );

      setEmail(
        user.email || ""
      );

      /* ===============================================
         MAIN ACCOUNT PROFILE
      ================================================ */

      const {
        data:
          profileData,

        error:
          profileError,
      } =
        await supabase
          .from(
            "profiles"
          )
          .select(
            "username, full_name"
          )
          .eq(
            "id",
            user.id
          )
          .maybeSingle();

      if (
        profileError
      ) {
        console.log("LOAD SELLER MAIN PROFILE ERROR:");
      }

      setUsername(
        profileData?.username ||
          meta.username ||
          profileData?.full_name ||
          meta.full_name ||
          buildUsernameFromEmail(
            user.email
          )
      );

      /* ===============================================
         SELLER PROFILE
      ================================================ */

      const {
        data:
          sellerData,

        error:
          sellerError,
      } =
        await supabase
          .from(
            "seller_profiles"
          )
          .select("*")
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

      if (
        sellerError
      ) {
        throw new Error(
          getFriendlySellerError(
            sellerError
          )
        );
      }      setProfileLoaded(true);
      if (sellerData) {
        setForm({
          store_name:
            sellerData.store_name ||
            "",

          store_description:
            sellerData.store_description ||
            "",

          seller_mobile:
            sellerData.seller_mobile ||
            "",

          pickup_municipality:
            sellerData.pickup_municipality ||
            "",

          pickup_municipality_code:
            sellerData.pickup_municipality_code ||
            "",

          pickup_barangay:
            sellerData.pickup_barangay ||
            "",

          pickup_barangay_code:
            sellerData.pickup_barangay_code ||
            "",

          pickup_note:
            sellerData.pickup_note ||
            "",

          shopee_url:
            sellerData.shopee_url ||
            "",

          lazada_url:
            sellerData.lazada_url ||
            "",

          facebook_url:
            sellerData.facebook_url ||
            "",

          tiktok_url:
            sellerData.tiktok_url ||
            "",

          website_url:
            sellerData.website_url ||
            "",

          is_active:
            typeof sellerData.is_active ===
            "boolean"
              ? sellerData.is_active
              : true,
        });

        if (
          sellerData.pickup_municipality_code ||
          sellerData.pickup_municipality
        ) {
          await loadBarangaysForLocality(
            {
              name:
                sellerData.pickup_municipality,

              code:
                sellerData.pickup_municipality_code ||
                sellerData.pickup_municipality,
            },
            {
              preserveBarangay:
                true,
            }
          );
        }
      }
    } catch (
      error
    ) {
      console.log("LOAD SELLER PROFILE ERROR:");

      setErrorText(
        error?.message ||
          "Unable to load seller profile."
      );
    } finally {
      setLoading(false);
    }
  }, [loadBarangaysForLocality]);

  useEffect(() => {
    Promise.all([loadSellerProfile(), loadBulacanLocalities()]);
  }, [loadSellerProfile, loadBulacanLocalities]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!saving) onBack?.();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, saving]);

  function validateSellerProfile() {
    if (
      !form.store_name.trim()
    ) {
      return "Please enter your store name.";
    }

    const mobile =
      form.seller_mobile.trim();

    if (!mobile) {
      return "Please enter your seller mobile number.";
    }

    // Match the Product Details dialer limits while allowing common formatting.
    const dialableMobile = mobile.replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{10,15}$/.test(dialableMobile)) {
      return "Please enter a valid mobile number.";
    }

    if (
      !form.pickup_municipality.trim()
    ) {
      return "Please select your default pickup city or municipality.";
    }

    if (
      !form.pickup_barangay.trim()
    ) {
      return "Please select your default pickup barangay.";
    }

    const links = [
      [
        "Shopee",
        form.shopee_url,
      ],

      [
        "Lazada",
        form.lazada_url,
      ],

      [
        "Facebook",
        form.facebook_url,
      ],

      [
        "TikTok Shop",
        form.tiktok_url,
      ],

      [
        "Website",
        form.website_url,
      ],
    ];

    for (
      const [
        label,
        value,
      ] of links
    ) {
      if (
        !isValidOptionalUrl(
          value
        )
      ) {
        return `${label} link is not a valid URL.`;
      }
    }

    return "";
  }

  /* =======================================================
     SAVE
  ======================================================= */

  async function handleSaveSellerProfile() {
    if (saveLock.current) return;
    if (!profileLoaded) {
      showError("Seller profile unavailable", "Return to Settings and reopen Seller Profile to load your existing record before saving.");
      return;
    }
    setErrorText("");
    setStatusText("");

    const validationMessage =
      validateSellerProfile();

    if (
      validationMessage
    ) {
      showError(
        "Seller profile incomplete",
        validationMessage
      );

      return;
    }

    if (
      !userId
    ) {
      showError(
        "Seller profile failed",
        "User session is missing."
      );

      return;
    }

    saveLock.current = true;
    setSaving(true);

    try {
      setStatusText(
        "Saving seller profile..."
      );

      const payload = {
        user_id:
          userId,

        store_name:
          form.store_name.trim(),

        store_description:
          form.store_description.trim() ||
          null,

        seller_mobile:
          form.seller_mobile.trim(),

        pickup_municipality:
          form.pickup_municipality.trim(),

        pickup_municipality_code:
          form.pickup_municipality_code ||
          null,

        pickup_barangay:
          form.pickup_barangay.trim(),

        pickup_barangay_code:
          form.pickup_barangay_code ||
          null,

        pickup_note:
          form.pickup_note.trim() ||
          null,

        shopee_url:
          normalizeOptionalUrl(
            form.shopee_url
          ),

        lazada_url:
          normalizeOptionalUrl(
            form.lazada_url
          ),

        facebook_url:
          normalizeOptionalUrl(
            form.facebook_url
          ),

        tiktok_url:
          normalizeOptionalUrl(
            form.tiktok_url
          ),

        website_url:
          normalizeOptionalUrl(
            form.website_url
          ),

        is_active:
          Boolean(
            form.is_active
          ),
      };

      const {
        error,
      } =
        await supabase
          .from(
            "seller_profiles"
          )
          .upsert(
            payload,
            {
              onConflict:
                "user_id",
            }
          );

      if (
        error
      ) {
        throw new Error(
          getFriendlySellerError(
            error
          )
        );
      }

      showNotice(
        "Seller profile saved",
        "Your store, contact, pickup details, and online shop links were saved successfully.",
        onBack
      );
    } catch (
      error
    ) {
      console.log("SAVE SELLER PROFILE ERROR:");

      showError(
        "Seller profile failed",
        error?.message ||
          "Unable to save seller profile."
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
      setStatusText("");
    }
  }

  /* =======================================================
     LOADING
  ======================================================= */

  if (
    loading
  ) {
    return (
      <AppScreen keyboard>
        <View
          style={
            styles.loadingRoot
          }
        >
          <View
            style={
              styles.loadingIcon
            }
          >
            <ActivityIndicator
              color={
                colors.accent2
              }
            />
          </View>

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading seller profile
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Getting your
            marketplace details.
          </Text>
        </View>
      </AppScreen>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <AppScreen keyboard>
      <View
        style={
          styles.root
        }
      >
        <AppHeader
          eyebrow="Marketplace"
          title="Seller Profile"
          subtitle="Manage your store, pickup details, contact information, and online shops."
          icon="storefront-outline"
          rightAction="close-outline"
          onRightPress={
            saving
              ? undefined
              : onBack
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.scroll
          }
        >
          {/* ===========================================
              HERO
          ============================================ */}

          <AppCard
            strong
            style={
              styles.heroCard
            }
          >
            <View
              style={
                styles.heroIcon
              }
            >
              <CrayfishIcon
                size={38}
                color={
                  colors.accent2
                }
              />
            </View>

            <View
              style={
                styles.heroContent
              }
            >
              <View
                style={
                  styles.heroTitleRow
                }
              >
                <Text
                  style={
                    styles.heroTitle
                  }
                  numberOfLines={1}
                >
                  {form.store_name ||
                    username ||
                    "CrayThrive Seller"}
                </Text>

                <View
                  style={[
                    styles.statusPill,

                    form.is_active
                      ? styles.activePill
                      : styles.inactivePill,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,

                      form.is_active
                        ? styles.activeDot
                        : styles.inactiveDot,
                    ]}
                  />

                  <Text
                    style={[
                      styles.statusPillText,

                      form.is_active
                        ? styles.activeText
                        : styles.inactiveText,
                    ]}
                  >
                    {form.is_active
                      ? "Active"
                      : "Inactive"}
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.heroText
                }
              >
                Your web and mobile
                Marketplace use the
                same seller profile.
              </Text>
            </View>
          </AppCard>

          {errorText ? (
            <ErrorMessage
              message={
                errorText
              }
            />
          ) : null}

          {/* ===========================================
              STATUS
          ============================================ */}

          <SectionIntro
            title="Seller status"
            subtitle="Control whether your seller profile is active."
          />

          <AppCard
            strong
            noShadow
            style={
              styles.statusCard
            }
          >
            <View
              style={
                styles.toggleIcon
              }
            >
              <Ionicons
                name={
                  form.is_active
                    ? "storefront-outline"
                    : "pause-circle-outline"
                }
                size={21}
                color={
                  colors.accent2
                }
              />
            </View>

            <View
              style={
                styles.toggleContent
              }
            >
              <Text
                style={
                  styles.toggleTitle
                }
              >
                Seller profile
              </Text>

              <Text
                style={
                  styles.toggleText
                }
              >
                {form.is_active
                  ? "Your seller profile is available for Marketplace use."
                  : "Your seller profile is currently inactive."}
              </Text>
            </View>

            <Switch
              value={
                form.is_active
              }
              disabled={
                saving
              }
              onValueChange={(
                value
              ) =>
                updateForm(
                  "is_active",
                  value
                )
              }
              trackColor={{
                false:
                  colors.border,

                true:
                  colors.accentBorder,
              }}
              thumbColor={
                form.is_active
                  ? colors.accent2
                  : colors.muted2
              }
            />
          </AppCard>

          {/* ===========================================
              STORE
          ============================================ */}

          <SectionIntro
            title="Store information"
            subtitle="This information is shown with your Marketplace seller profile."
          />

          <AppCard
            strong
            style={
              styles.formCard
            }
          >
            <FormInput
              label="Store name"
              value={
                form.store_name
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "store_name",
                  value
                )
              }
              placeholder="Example: Juan's Crayfish Farm"
              icon="storefront-outline"
              editable={
                !saving
              }
              focused={
                focusedField ===
                "storeName"
              }
              onFocus={() =>
                setFocusedField(
                  "storeName"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <FormInput
              label="Store description"
              optional
              value={
                form.store_description
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "store_description",
                  value
                )
              }
              placeholder="Tell buyers about your farm, products, or store."
              icon="document-text-outline"
              multiline
              editable={
                !saving
              }
              focused={
                focusedField ===
                "storeDescription"
              }
              onFocus={() =>
                setFocusedField(
                  "storeDescription"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />
          </AppCard>

          {/* ===========================================
              ACCOUNT
          ============================================ */}

          <SectionIntro
            title="Seller information"
            subtitle="Your account identity is read-only. Add the contact number buyers can use."
          />

          <AppCard
            strong
            style={
              styles.formCard
            }
          >
            <ReadOnlyRow
              label="Display name"
              value={
                username
              }
              icon="person-outline"
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <ReadOnlyRow
              label="Login email"
              value={
                email
              }
              icon="mail-outline"
            />

            <View
              style={
                styles.formDivider
              }
            />

            <FormInput
              label="Mobile number"
              value={
                form.seller_mobile
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "seller_mobile",
                  mobileOnly(
                    value
                  )
                )
              }
              placeholder="09XXXXXXXXX"
              icon="call-outline"
              keyboardType="phone-pad"
              editable={
                !saving
              }
              focused={
                focusedField ===
                "mobile"
              }
              onFocus={() =>
                setFocusedField(
                  "mobile"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />
          </AppCard>

          {/* ===========================================
              LOCATION
          ============================================ */}

          <View
            style={
              styles.sectionIntro
            }
          >
            <View
              style={
                styles.sectionTitleRow
              }
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Pickup location
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Select your
                  default location
                  in Bulacan.
                </Text>
              </View>

              <View
                style={
                  styles.bulacanPill
                }
              >
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={
                    colors.accent2
                  }
                />

                <Text
                  style={
                    styles.bulacanPillText
                  }
                >
                  Bulacan
                </Text>
              </View>
            </View>
          </View>

          <AppCard
            strong
            style={
              styles.locationCard
            }
          >
            <LocationDropdown
              label="City / Municipality"
              value={
                form.pickup_municipality ||
                "Select city or municipality"
              }
              selectedValue={
                form.pickup_municipality
              }
              open={
                municipalityOpen
              }
              loading={
                loadingLocalities
              }
              items={
                localities
              }
              icon="business-outline"
              disabled={
                saving
              }
              onToggle={() => {
                setMunicipalityOpen(
                  (previous) =>
                    !previous
                );

                setBarangayOpen(
                  false
                );
              }}
              onSelect={
                selectMunicipality
              }
            />

            <LocationDropdown
              label="Barangay"
              value={
                form.pickup_barangay ||
                "Select barangay"
              }
              selectedValue={
                form.pickup_barangay
              }
              open={
                barangayOpen
              }
              loading={
                loadingBarangays
              }
              items={
                barangays
              }
              icon="location-outline"
              disabled={
                saving ||
                !hasSelectedMunicipality
              }
              emptyText={
                hasSelectedMunicipality
                  ? "No barangays available"
                  : "Select a city or municipality first"
              }
              onToggle={() => {
                if (
                  !hasSelectedMunicipality
                ) {
                  return;
                }

                setBarangayOpen(
                  (previous) =>
                    !previous
                );

                setMunicipalityOpen(
                  false
                );
              }}
              onSelect={
                selectBarangay
              }
            />

            <FormInput
              label="Pickup note"
              optional
              value={
                form.pickup_note
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "pickup_note",
                  value
                )
              }
              placeholder="Example: Pickup near barangay hall"
              icon="document-text-outline"
              multiline
              editable={
                !saving
              }
              focused={
                focusedField ===
                "pickupNote"
              }
              onFocus={() =>
                setFocusedField(
                  "pickupNote"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />
          </AppCard>

          {/* ===========================================
              ONLINE STORES
          ============================================ */}

          <SectionIntro
            title="Online shops"
            subtitle="Optional links buyers can use to visit your other stores."
          />

          <AppCard
            strong
            style={
              styles.locationCard
            }
          >
            <FormInput
              label="Shopee"
              optional
              value={
                form.shopee_url
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "shopee_url",
                  value
                )
              }
              placeholder="https://shopee.ph/your-store"
              icon="bag-handle-outline"
              editable={
                !saving
              }
              autoCapitalize="none"
              focused={
                focusedField ===
                "shopee"
              }
              onFocus={() =>
                setFocusedField(
                  "shopee"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <FormInput
              label="Lazada"
              optional
              value={
                form.lazada_url
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "lazada_url",
                  value
                )
              }
              placeholder="https://www.lazada.com.ph/shop/your-store"
              icon="bag-outline"
              editable={
                !saving
              }
              autoCapitalize="none"
              focused={
                focusedField ===
                "lazada"
              }
              onFocus={() =>
                setFocusedField(
                  "lazada"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <FormInput
              label="Facebook"
              optional
              value={
                form.facebook_url
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "facebook_url",
                  value
                )
              }
              placeholder="https://facebook.com/your-page"
              icon="logo-facebook"
              editable={
                !saving
              }
              autoCapitalize="none"
              focused={
                focusedField ===
                "facebook"
              }
              onFocus={() =>
                setFocusedField(
                  "facebook"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <FormInput
              label="TikTok Shop"
              optional
              value={
                form.tiktok_url
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "tiktok_url",
                  value
                )
              }
              placeholder="https://www.tiktok.com/@your-store"
              icon="logo-tiktok"
              editable={
                !saving
              }
              autoCapitalize="none"
              focused={
                focusedField ===
                "tiktok"
              }
              onFocus={() =>
                setFocusedField(
                  "tiktok"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <FormInput
              label="Website / Other store"
              optional
              value={
                form.website_url
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "website_url",
                  value
                )
              }
              placeholder="https://yourstore.com"
              icon="globe-outline"
              editable={
                !saving
              }
              autoCapitalize="none"
              focused={
                focusedField ===
                "website"
              }
              onFocus={() =>
                setFocusedField(
                  "website"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
            />

            <View
              style={
                styles.infoBox
              }
            >
              <View
                style={
                  styles.infoIcon
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={17}
                  color={
                    colors.accent2
                  }
                />
              </View>

              <Text
                style={
                  styles.infoText
                }
              >
                Store details saved
                here are shared with
                your CrayThrive web
                dashboard and mobile
                Marketplace.
              </Text>
            </View>

            {statusText ? (
              <View
                style={
                  styles.savingBox
                }
              >
                <ActivityIndicator
                  size="small"
                  color={
                    colors.accent2
                  }
                />

                <Text
                  style={
                    styles.savingText
                  }
                >
                  {statusText}
                </Text>
              </View>
            ) : null}

            <AppButton
              title={
                saving
                  ? "Saving..."
                  : "Save Seller Profile"
              }
              icon="save-outline"
              onPress={
                handleSaveSellerProfile
              }
              loading={
                saving
              }
              disabled={
                saving
              }
              style={
                styles.saveButton
              }
            />

            <TouchableOpacity
              activeOpacity={
                0.82
              }
              style={
                styles.cancelButton
              }
              onPress={
                onBack
              }
              disabled={
                saving
              }
            >
              <Text
                style={
                  styles.cancelText
                }
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </AppCard>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

/* =========================================================
   SECTION INTRO
========================================================= */

function SectionIntro({
  title,
  subtitle,
}) {
  const { styles } = useThemePack();
  return (
    <View
      style={
        styles.sectionIntro
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
  );
}

/* =========================================================
   READ ONLY
========================================================= */

function ReadOnlyRow({
  label,
  value,
  icon,
}) {
  const { colors, styles } = useThemePack();
  return (
    <View
      style={
        styles.readOnlyRow
      }
    >
      <View
        style={
          styles.readOnlyIcon
        }
      >
        <Ionicons
          name={
            icon
          }
          size={18}
          color={
            colors.accent2
          }
        />
      </View>

      <View
        style={
          styles.readOnlyContent
        }
      >
        <Text
          style={
            styles.readOnlyLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.readOnlyValue
          }
          numberOfLines={1}
        >
          {value ||
            "Not set"}
        </Text>
      </View>

      <Ionicons
        name="lock-closed-outline"
        size={14}
        color={
          colors.muted2
        }
      />
    </View>
  );
}

/* =========================================================
   INPUT
========================================================= */

function FormInput({
  label,
  optional = false,

  value,
  onChangeText,

  placeholder,
  icon,

  keyboardType,

  multiline = false,
  editable = true,

  focused,
  onFocus,
  onBlur,

  autoCapitalize = "sentences",
}) {
  const { colors, styles } = useThemePack();
  return (
    <View
      style={
        styles.formGroup
      }
    >
      <View
        style={
          styles.labelRow
        }
      >
        <Text
          style={
            styles.inputLabel
          }
        >
          {label}
        </Text>

        {optional ? (
          <Text
            style={
              styles.optionalText
            }
          >
            Optional
          </Text>
        ) : (
          <Text
            style={
              styles.requiredText
            }
          >
            Required
          </Text>
        )}
      </View>

      <View
        style={[
          styles.formInput,

          focused &&
            styles.formInputFocused,

          multiline &&
            styles.formInputMultiline,

          !editable &&
            styles.formInputDisabled,
        ]}
      >
        <View
          style={
            styles.inputIcon
          }
        >
          <Ionicons
            name={
              icon
            }
            size={18}
            color={
              focused
                ? colors.accent2
                : colors.muted
            }
          />
        </View>

        <TextInput
          value={
            value
          }
          onChangeText={
            onChangeText
          }
          placeholder={
            placeholder
          }
          placeholderTextColor={
            colors.muted2
          }
          style={[
            styles.formTextInput,

            multiline &&
              styles.formTextArea,
          ]}
          keyboardType={
            keyboardType
          }
          multiline={
            multiline
          }
          editable={
            editable
          }
          autoCorrect={
            false
          }
          autoCapitalize={
            autoCapitalize
          }
          onFocus={
            onFocus
          }
          onBlur={
            onBlur
          }
        />
      </View>
    </View>
  );
}

/* =========================================================
   LOCATION DROPDOWN
========================================================= */

function LocationDropdown({
  label,

  value,
  selectedValue,

  open,
  loading,

  items,

  icon,
  disabled,

  emptyText =
    "No options found",

  onToggle,
  onSelect,
}) {
  const { colors, styles } = useThemePack();
  return (
    <View
      style={
        styles.formGroup
      }
    >
      <Text
        style={
          styles.inputLabel
        }
      >
        {label}
      </Text>

      <TouchableOpacity
        activeOpacity={
          0.86
        }
        style={[
          styles.dropdownButton,

          open &&
            styles.dropdownButtonActive,

          disabled &&
            styles.dropdownButtonDisabled,
        ]}
        onPress={
          onToggle
        }
        disabled={
          disabled
        }
      >
        <View
          style={
            styles.dropdownIcon
          }
        >
          <Ionicons
            name={
              icon
            }
            size={18}
            color={
              disabled
                ? colors.muted2
                : colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.dropdownContent
          }
        >
          <Text
            style={[
              styles.dropdownValue,

              !selectedValue &&
                styles.dropdownPlaceholder,
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>

          <Text
            style={
              styles.dropdownHelper
            }
          >
            {loading
              ? "Loading locations..."
              : selectedValue
                ? "Default pickup location"
                : "Tap to choose"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              colors.accent2
            }
          />
        ) : (
          <Ionicons
            name={
              open
                ? "chevron-up"
                : "chevron-down"
            }
            size={18}
            color={
              disabled
                ? colors.muted2
                : colors.accent2
            }
          />
        )}
      </TouchableOpacity>

      {open ? (
        <View
          style={
            styles.dropdownMenu
          }
        >
          {items.length ===
          0 ? (
            <View
              style={
                styles.dropdownEmpty
              }
            >
              <Ionicons
                name="location-outline"
                size={20}
                color={
                  colors.muted2
                }
              />

              <Text
                style={
                  styles.dropdownEmptyText
                }
              >
                {emptyText}
              </Text>
            </View>
          ) : (
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={
                styles.dropdownScroll
              }
            >
              {items.map(
                (item) => {
                  const selected =
                    item.name ===
                    selectedValue;

                  return (
                    <TouchableOpacity
                      key={
                        item.code ||
                        item.name
                      }
                      activeOpacity={
                        0.86
                      }
                      style={[
                        styles.dropdownItem,

                        selected &&
                          styles.dropdownItemSelected,
                      ]}
                      onPress={() =>
                        onSelect(
                          item
                        )
                      }
                    >
                      <View
                        style={
                          styles.dropdownItemIcon
                        }
                      >
                        <Ionicons
                          name={
                            icon
                          }
                          size={17}
                          color={
                            colors.accent2
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.dropdownItemContent
                        }
                      >
                        <Text
                          style={
                            styles.dropdownItemTitle
                          }
                        >
                          {item.name}
                        </Text>

                        <Text
                          style={
                            styles.dropdownItemNote
                          }
                        >
                          {item.type
                            ? formatType(
                                item.type
                              )
                            : "Barangay"}
                        </Text>
                      </View>

                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={
                            colors.accent2
                          }
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                }
              )}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

/* =========================================================
   ERROR
========================================================= */

function ErrorMessage({
  message,
}) {
  const { colors, styles } = useThemePack();
  return (
    <View
      style={
        styles.errorBox
      }
    >
      <View
        style={
          styles.errorIcon
        }
      >
        <Ionicons
          name="alert-circle-outline"
          size={19}
          color={
            colors.danger
          }
        />
      </View>

      <View
        style={
          styles.errorContent
        }
      >
        <Text
          style={
            styles.errorTitle
          }
        >
          Check your seller profile
        </Text>

        <Text
          style={
            styles.errorText
          }
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeApiList(
  json
) {
  if (
    Array.isArray(
      json
    )
  ) {
    return json;
  }

  if (
    Array.isArray(
      json?.data
    )
  ) {
    return json.data;
  }

  if (
    Array.isArray(
      json?.items
    )
  ) {
    return json.items;
  }

  if (
    Array.isArray(
      json?.results
    )
  ) {
    return json.results;
  }

  return [];
}

function inferLocalityType(
  name
) {
  const text =
    String(
      name || ""
    ).toLowerCase();

  return text.includes(
    "city"
  )
    ? "city"
    : "municipality";
}

function mobileOnly(value) {
  return String(
    value || ""
  )
    .replace(
      /[^0-9+]/g,
      ""
    )
    .slice(
      0,
      14
    );
}

function buildUsernameFromEmail(
  email
) {
  const value =
    String(
      email || ""
    ).trim();

  if (
    !value.includes("@")
  ) {
    return "CrayThrive Seller";
  }

  return (
    value.split("@")[0] ||
    "CrayThrive Seller"
  );
}

function normalizeOptionalUrl(value) {
  return normalizeStoreUrl(value) || null;
}

function isValidOptionalUrl(value) {
  return !String(value || "").trim() || Boolean(normalizeStoreUrl(value));
}

function getFriendlySellerError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    ).toLowerCase();

  if (
    message.includes(
      "seller_profiles"
    )
  ) {
    return "Seller profile storage is currently unavailable.";
  }

  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes(
      "policy"
    )
  ) {
    return "Your account does not currently have permission to update this seller profile.";
  }

  return (
    error?.message ||
    "Unable to save seller profile."
  );
}

function formatType(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

/* =========================================================
   STYLES
========================================================= */

function useThemePack() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return { colors, styles };
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 16
    },
    scroll: {
      paddingTop: 3,
      paddingBottom: 140
    },
    /* LOADING */

    loadingRoot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24
    },
    loadingIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    loadingTitle: {
      marginTop: 13,
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700"
    },
    loadingText: {
      marginTop: 5,
      color: colors.muted,
      fontSize: 12
    },
    /* HERO */

    heroCard: {
      padding: 16,
      borderRadius: 22,
      flexDirection: "row",
      alignItems: "center",
      ...SHADOW.soft
    },
    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    heroContent: {
      flex: 1,
      minWidth: 0
    },
    heroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    heroTitle: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "700",
      letterSpacing: -0.25
    },
    heroText: {
      marginTop: 5,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    statusPill: {
      minHeight: 25,
      paddingHorizontal: 8,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1
    },
    activePill: {
      backgroundColor: colors.successSoft,
      borderColor: "rgba(74,222,128,0.20)"
    },
    inactivePill: {
      backgroundColor: colors.surfaceSoft,
      borderColor: colors.border
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3
    },
    activeDot: {
      backgroundColor: colors.success
    },
    inactiveDot: {
      backgroundColor: colors.muted2
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: "600"
    },
    activeText: {
      color: colors.success
    },
    inactiveText: {
      color: colors.muted
    },
    /* ERROR */

    errorBox: {
      marginTop: 11,
      padding: 12,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.dangerSoft,
      borderWidth: 1,
      borderColor: "rgba(248,113,113,0.23)"
    },
    errorIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: "rgba(248,113,113,0.10)"
    },
    errorContent: {
      flex: 1
    },
    errorTitle: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "700"
    },
    errorText: {
      marginTop: 3,
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18
    },
    /* SECTION */

    sectionIntro: {
      marginTop: 23,
      marginBottom: 11
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      rowGap: 8
    },
    sectionTitle: {
      color: colors.textStrong,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
      flexShrink: 1
    },
    sectionSubtitle: {
      marginTop: 3,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 18
    },
    /* STATUS */

    statusCard: {
      minHeight: 78,
      padding: 13,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center"
    },
    toggleIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    toggleContent: {
      flex: 1,
      paddingRight: 8
    },
    toggleTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    toggleText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    /* FORM */

    formCard: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 19
    },
    locationCard: {
      padding: 15,
      borderRadius: 19
    },
    formGroup: {
      marginBottom: 16
    },
    labelRow: {
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      rowGap: 8
    },
    inputLabel: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600",
      flexShrink: 1
    },
    optionalText: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    requiredText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600"
    },
    formInput: {
      minHeight: 56,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14
    },
    formInputFocused: {
      backgroundColor: "rgba(34,211,197,0.04)",
      borderColor: colors.accentBorder
    },
    formInputDisabled: {
      opacity: 0.6
    },
    formInputMultiline: {
      minHeight: 96,
      alignItems: "flex-start"
    },
    inputIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    formTextInput: {
      flex: 1,
      minHeight: 54,
      paddingVertical: 0,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "500"
    },
    formTextArea: {
      minHeight: 84,
      paddingTop: 11,
      paddingBottom: 10,
      textAlignVertical: "top"
    },
    /* READ ONLY */

    readOnlyRow: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center"
    },
    readOnlyIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    readOnlyContent: {
      flex: 1,
      minWidth: 0
    },
    readOnlyLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500"
    },
    readOnlyValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    rowDivider: {
      height: 1,
      marginLeft: 48,
      backgroundColor: colors.border
    },
    formDivider: {
      height: 1,
      marginTop: 3,
      marginBottom: 16,
      backgroundColor: colors.border
    },
    /* BULACAN */

    bulacanPill: {
      minHeight: 27,
      paddingHorizontal: 9,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    bulacanPillText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600"
    },
    /* DROPDOWN */

    dropdownButton: {
      minHeight: 62,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8
    },
    dropdownButtonActive: { minHeight: 44,
      backgroundColor: colors.surfaceStrong,
      borderColor: colors.accentBorder
    },
    dropdownButtonDisabled: { minHeight: 44,
      opacity: 0.5
    },
    dropdownIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    dropdownContent: {
      flex: 1,
      minWidth: 0
    },
    dropdownValue: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    dropdownPlaceholder: {
      color: colors.muted,
      fontWeight: "400"
    },
    dropdownHelper: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12
    },
    dropdownMenu: {
      marginTop: 7,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      ...SHADOW.soft
    },
    dropdownScroll: {
      maxHeight: 230
    },
    dropdownItem: {
      minHeight: 58,
      paddingHorizontal: 11,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    },
    dropdownItemSelected: { minHeight: 44,
      backgroundColor: colors.accentSoft
    },
    dropdownItemIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: colors.accentSoft
    },
    dropdownItemContent: {
      flex: 1,
      minWidth: 0
    },
    dropdownItemTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    dropdownItemNote: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12
    },
    dropdownEmpty: {
      padding: 18,
      alignItems: "center",
      justifyContent: "center"
    },
    dropdownEmptyText: {
      marginTop: 6,
      color: colors.muted,
      fontSize: 12,
      textAlign: "center"
    },
    /* INFO */

    infoBox: {
      marginTop: -1,
      marginBottom: 17,
      padding: 11,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    infoIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
      backgroundColor: colors.surfaceSoft
    },
    infoText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    savingBox: {
      marginBottom: 15,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    savingText: {
      flex: 1,
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "500"
    },
    saveButton: {
      marginTop: 2,
      minHeight: 44,
      paddingVertical: 8
    },
    cancelButton: {
      minHeight: 44,
      marginTop: 9,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8
    },
    cancelText: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: "600"
    }
  });
}
