import { validateSelectedImage, validateImageBytes, MAX_IMAGE_BYTES } from '../../utils/uploadSecurity';
// src/screens/main/AddMarketplaceListingScreen.js

import { Ionicons } from "@expo/vector-icons";
import { decode } from "base-64";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ActivityIndicator, Alert, BackHandler, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppButton from "../../components/ui/AppButton";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";

import {
  COLORS,
  RADIUS,
  SHADOW,
} from "../../constants/theme";

import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import ResilientImage from '../../components/ui/ResilientImage';

/* =========================================================
   CONFIG
========================================================= */

const BUCKET_NAME =
  "marketplace-images";

const BREEDER_NOTE =
  "Breeder set: 2 female and 1 male.";

/* =========================================================
   CATEGORIES
========================================================= */

const CATEGORY_OPTIONS = [
  {
    value: "crayfish",
    label: "Crayfish",
    icon: "fish-outline",
    note: "Juveniles, adults and breeders",
  },
  {
    value: "feeds",
    label: "Feeds",
    icon: "nutrition-outline",
    note: "Pellets, supplements and feed",
  },
  {
    value: "tanks_enclosures",
    label: "Tanks",
    icon: "cube-outline",
    note: "Tanks, shelters and hides",
  },
  {
    value: "water_care",
    label: "Water Care",
    icon: "water-outline",
    note: "Conditioners and maintenance",
  },
  {
    value: "test_kits",
    label: "Test Kits",
    icon: "flask-outline",
    note: "Water quality testing products",
  },
  {
    value: "equipment",
    label: "Equipment",
    icon: "construct-outline",
    note: "Pumps, aerators and sensors",
  },
  {
    value: "accessories",
    label: "Accessories",
    icon: "hardware-chip-outline",
    note: "Tubing, nets and fittings",
  },
  {
    value: "others",
    label: "Others",
    icon: "ellipsis-horizontal-circle-outline",
    note: "Other aquaculture products",
  },
];

const SUBCATEGORY_OPTIONS = {
  crayfish: [
    {
      value: "Juvenile",
      label: "Juvenile",
    },
    {
      value: "Adult",
      label: "Adult",
    },
    {
      value: "Breeder",
      label: "Breeder",
    },
    {
      value: "Mixed Stock",
      label: "Mixed Stock",
    },
    {
      value: "Other Crayfish",
      label: "Other Crayfish",
    },
  ],

  feeds: [
    {
      value: "Pellets",
      label: "Pellets",
    },
    {
      value: "Custom Feed",
      label: "Custom Feed",
    },
    {
      value: "Supplements",
      label: "Supplements",
    },
    {
      value: "Natural Feed",
      label: "Natural Feed",
    },
    {
      value: "Other Feed",
      label: "Other Feed",
    },
  ],

  tanks_enclosures: [
    {
      value: "Tank",
      label: "Tank",
    },
    {
      value: "PVC Hide",
      label: "PVC Hide",
    },
    {
      value: "Shelter",
      label: "Shelter",
    },
    {
      value: "Enclosure",
      label: "Enclosure",
    },
    {
      value: "Tank Divider",
      label: "Tank Divider",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],

  water_care: [
    {
      value: "Water Conditioner",
      label: "Water Conditioner",
    },
    {
      value: "Filter Media",
      label: "Filter Media",
    },
    {
      value: "Beneficial Bacteria",
      label: "Beneficial Bacteria",
    },
    {
      value: "Dechlorinator",
      label: "Dechlorinator",
    },
    {
      value: "Cleaning Supply",
      label: "Cleaning Supply",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],

  test_kits: [
    {
      value: "pH Test Kit",
      label: "pH Test Kit",
    },
    {
      value: "Ammonia Test Kit",
      label: "Ammonia Test Kit",
    },
    {
      value: "Nitrite Test Kit",
      label: "Nitrite Test Kit",
    },
    {
      value: "Nitrate Test Kit",
      label: "Nitrate Test Kit",
    },
    {
      value: "Water Quality Kit",
      label: "Water Quality Kit",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],

  equipment: [
    {
      value: "Water Pump",
      label: "Water Pump",
    },
    {
      value: "Air Pump",
      label: "Air Pump",
    },
    {
      value: "Aerator",
      label: "Aerator",
    },
    {
      value: "Filter",
      label: "Filter",
    },
    {
      value: "Sensor",
      label: "Sensor",
    },
    {
      value: "Feeder",
      label: "Feeder",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],

  accessories: [
    {
      value: "Tubing",
      label: "Tubing",
    },
    {
      value: "Net",
      label: "Net",
    },
    {
      value: "Container",
      label: "Container",
    },
    {
      value: "Fitting",
      label: "Fitting",
    },
    {
      value: "Hose",
      label: "Hose",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],

  others: [
    {
      value: "Custom Product",
      label: "Custom Product",
    },
    {
      value: "Farm Supply",
      label: "Farm Supply",
    },
    {
      value: "Aquaculture Supply",
      label: "Aquaculture Supply",
    },
    {
      value: "Other",
      label: "Other",
    },
  ],
};

/* =========================================================
   CRAYFISH OPTIONS
========================================================= */

const CRAYFISH_TYPE_OPTIONS = [
  {
    label: "Redclaw Crayfish",
    value: "Redclaw Crayfish",
    note: "Standard redclaw listing",
  },
  {
    label: "Redclaw Breeder Line",
    value: "Redclaw Breeder Line",
    note: "Selected breeder stock",
  },
  {
    label: "Mixed Redclaw Sizes",
    value: "Mixed Redclaw Sizes",
    note: "Grouped or mixed sizes",
  },
];

const STAGE_OPTIONS = [
  {
    label: "Juvenile",
    value: "juvenile",
  },
  {
    label: "Adult",
    value: "adult",
  },
  {
    label: "Breeder",
    value: "breeder",
  },
];

const SEX_OPTIONS = [
  {
    label: "Unknown",
    value: "unknown",
  },
  {
    label: "Male",
    value: "male",
  },
  {
    label: "Female",
    value: "female",
  },
  {
    label: "Mixed",
    value: "mixed",
  },
];

/* =========================================================
   GENERAL PRODUCT OPTIONS
========================================================= */

const UNIT_OPTIONS = [
  {
    value: "piece",
    label: "Piece",
  },
  {
    value: "set",
    label: "Set",
  },
  {
    value: "pack",
    label: "Pack",
  },
  {
    value: "bag",
    label: "Bag",
  },
  {
    value: "box",
    label: "Box",
  },
  {
    value: "kg",
    label: "Kilogram",
  },
  {
    value: "gram",
    label: "Gram",
  },
  {
    value: "liter",
    label: "Liter",
  },
];

const CONDITION_OPTIONS = [
  {
    value: "new",
    label: "New",
  },
  {
    value: "used",
    label: "Used",
  },
  {
    value: "refurbished",
    label: "Refurbished",
  },
  {
    value: "not_applicable",
    label: "Not Applicable",
  },
];

/* =========================================================
   EMPTY FORM
========================================================= */

const EMPTY_FORM = {
  title: "",

  category:
    "crayfish",

  subcategory:
    "Juvenile",

  description:
    "",

  price:
    "",

  quantity:
    "1",

  unit:
    "piece",

  product_condition:
    "not_applicable",

  brand:
    "",

  sku:
    "",

  is_custom_product:
    false,

  crayfish_type:
    "Redclaw Crayfish",

  stage:
    "juvenile",

  sex:
    "unknown",

  size_label:
    "",

  seller_mobile:
    "",

  pickup_municipality:
    "",

  pickup_municipality_code:
    "",

  pickup_barangay:
    "",

  pickup_barangay_code:
    "",
};

/* =========================================================
   PAGE
========================================================= */

export default function AddMarketplaceListingScreen({
  onBack,
  onCreated,
}) {
  const {
    colors,
    styles,
  } =
    useThemePack();

  const publishLock = useRef(false);
  const [
    form,
    setForm,
  ] =
    useState(
      EMPTY_FORM
    );

  const [
    imageAsset,
    setImageAsset,
  ] =
    useState(null);

  const [
    sellerProfile,
    setSellerProfile,
  ] =
    useState(null);

  const [
    categoryOpen,
    setCategoryOpen,
  ] =
    useState(false);

  const [
    subcategoryOpen,
    setSubcategoryOpen,
  ] =
    useState(false);

  const [
    typeOpen,
    setTypeOpen,
  ] =
    useState(false);

  const [
    unitOpen,
    setUnitOpen,
  ] =
    useState(false);

  const [
    conditionOpen,
    setConditionOpen,
  ] =
    useState(false);

  const [
    focusedField,
    setFocusedField,
  ] =
    useState("");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    statusText,
    setStatusText,
  ] =
    useState("");

  const [
    errorText,
    setErrorText,
  ] =
    useState("");

  /* =======================================================
     DERIVED
  ======================================================= */

  const isCrayfish =
    form.category ===
    "crayfish";

  const isBreeder =
    isCrayfish &&
    form.stage ===
      "breeder";

  const selectedCategory =
    useMemo(() => {
      return (
        CATEGORY_OPTIONS.find(
          (item) =>
            item.value ===
            form.category
        ) ||
        CATEGORY_OPTIONS[0]
      );
    }, [
      form.category,
    ]);

  const selectedType =
    useMemo(() => {
      return (
        CRAYFISH_TYPE_OPTIONS.find(
          (item) =>
            item.value ===
            form.crayfish_type
        ) ||
        CRAYFISH_TYPE_OPTIONS[0]
      );
    }, [
      form.crayfish_type,
    ]);

  const subcategories =
    useMemo(() => {
      return (
        SUBCATEGORY_OPTIONS[
          form.category
        ] || []
      );
    }, [
      form.category,
    ]);

  /* =======================================================
     LOAD
  ======================================================= */

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!saving) onBack?.();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, saving]);

  async function loadInitialData() {
    setLoading(true);
    setErrorText("");

    try {
      const {
        data:
          userData,

        error:
          userError,
      } =
        await supabase
          .auth
          .getUser();

      if (
        userError
      ) {
        throw userError;
      }

      const user =
        userData?.user;

      if (
        !user?.id
      ) {
        throw new Error(
          "Please sign in before creating a Marketplace listing."
        );
      }

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
        throw sellerError;
      }

      setSellerProfile(
        sellerData ||
          null
      );

      if (
        sellerData
      ) {
        setForm(
          (previous) => ({
            ...previous,

            seller_mobile:
              sellerData
                .seller_mobile ||
              "",

            pickup_municipality:
              sellerData
                .pickup_municipality ||
              "",

            pickup_municipality_code:
              sellerData
                .pickup_municipality_code ||
              "",

            pickup_barangay:
              sellerData
                .pickup_barangay ||
              "",

            pickup_barangay_code:
              sellerData
                .pickup_barangay_code ||
              "",
          })
        );
      }
    } catch (
      error
    ) {
      console.log("LOAD ADD LISTING ERROR:");

      setErrorText(
        error?.message ||
          "Unable to prepare the listing form."
      );
    } finally {
      setLoading(false);
    }
  }

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

        [key]:
          value,
      })
    );
  }

  function closeDropdowns() {
    setCategoryOpen(
      false
    );

    setSubcategoryOpen(
      false
    );

    setTypeOpen(
      false
    );

    setUnitOpen(
      false
    );

    setConditionOpen(
      false
    );
  }

  function selectCategory(
    category
  ) {
    const options =
      SUBCATEGORY_OPTIONS[
        category
      ] || [];

    setForm(
      (previous) => ({
        ...previous,

        category,

        subcategory: category === "crayfish" && previous.stage === "breeder" ? "Breeder" : options[0]?.value || "",

        unit: category === "crayfish" ? (previous.stage === "breeder" ? "set" : "piece") : previous.unit,
      ...(category === "crayfish" && previous.stage === "breeder"
        ? { quantity: "3", sex: "mixed" }
        : {}),

        product_condition:
          category ===
          "crayfish"
            ? "not_applicable"
            : previous
                .product_condition ===
              "not_applicable"
              ? "new"
              : previous
                  .product_condition,
      })
    );

    closeDropdowns();
  }

  function selectStage(
    stage
  ) {
    setErrorText("");

    setForm(
      (previous) => {
        if (
          stage ===
          "breeder"
        ) {
          return {
            ...previous,

            stage:
              "breeder",

            sex:
              "mixed",

            quantity:
              "3",

            unit:
              "set",

            subcategory:
              "Breeder",

            title:
              previous.title.trim()
                ? previous.title
                : "Redclaw Breeder Trio",

            crayfish_type:
              previous.crayfish_type ===
              "Redclaw Crayfish"
                ? "Redclaw Breeder Line"
                : previous.crayfish_type,
          };
        }

        return {
          ...previous,

          stage,

          subcategory:
            stage ===
            "juvenile"
              ? "Juvenile"
              : "Adult",

          sex:
            previous.sex ===
            "mixed"
              ? "unknown"
              : previous.sex,

          quantity:
            previous.stage ===
              "breeder" &&
            previous.quantity ===
              "3"
              ? "1"
              : previous.quantity,

          unit:
            previous.stage ===
              "breeder"
              ? "piece"
              : previous.unit,
        };
      }
    );
  }

  function selectSex(
    sex
  ) {
    if (
      isBreeder
    ) {
      return;
    }

    updateForm(
      "sex",
      sex
    );
  }

  /* =======================================================
     ALERT
  ======================================================= */

  function showError(
    title,
    message
  ) {
    setErrorText(
      message || title
    );

    if (
      Platform.OS !==
      "web"
    ) {
      Alert.alert(
        title,
        message
      );
    }
  }

  function showSuccess() {
    if (
      Platform.OS !==
      "web"
    ) {
      Alert.alert(
        "Product published",
        "Your Marketplace product is now active.",
        [
          {
            text: "OK",

            onPress: () => {
              resetForm();

              onCreated?.();
            },
          },
        ]
      );

      return;
    }

    if (
      typeof window !==
      "undefined"
    ) {
      window.alert(
        "Product published\n\nYour Marketplace product is now active."
      );
    }

    resetForm();

    onCreated?.();
  }

  /* =======================================================
     IMAGE
  ======================================================= */

  async function pickImage() {
    setErrorText("");

    try {
      const permission =
        await ImagePicker
          .requestMediaLibraryPermissionsAsync();

      if (
        !permission.granted
      ) {
        showError(
          "Gallery permission needed",
          "Please allow gallery access to choose a product photo."
        );

        return;
      }

      const result =
        await ImagePicker
          .launchImageLibraryAsync({
            mediaTypes: ["images"],

            allowsEditing:
              true,

            aspect:
              [4, 3],

            quality:
              0.75,

            base64:
              false,
          });

      if (
        result.canceled
      ) {
        return;
      }

      const asset =
        result.assets?.[
          0
        ];

      if (
        !asset?.uri
      ) {
        showError(
          "No image selected",
          "Please select a valid product image."
        );

        return;
      }

      setImageAsset(
        asset
      );
    } catch (
      error
    ) {
      console.log("PICK MARKETPLACE IMAGE ERROR:");

      showError(
        "Image picker failed",
        error?.message ||
          "Something went wrong while selecting the product image."
      );
    }
  }

  function removeImage() {
    setImageAsset(
      null
    );

    setErrorText("");
  }

  async function uploadImageIfSelected(
    userId
  ) {
    if (
      !imageAsset?.uri
    ) {
      return null;
    }

    setStatusText(
      "Preparing product photo..."
    );

    validateSelectedImage(imageAsset);

    try {
      const arrayBuffer =
        await uriToArrayBuffer(
          imageAsset.uri
        );

      const { fileExt, contentType } = validateImageBytes(arrayBuffer);
      const filePath = `${userId}/${Date.now()}-${randomString()}.${fileExt}`;

      setStatusText(
        "Uploading product photo..."
      );

      const {
        error:
          uploadError,
      } =
        await supabase
          .storage
          .from(
            BUCKET_NAME
          )
          .upload(
            filePath,
            arrayBuffer,
            {
              contentType,
              upsert:
                false,
            }
          );

      if (
        uploadError
      ) {
        throw uploadError;
      }

      const {
        data,
      } =
        supabase
          .storage
          .from(
            BUCKET_NAME
          )
          .getPublicUrl(
            filePath
          );

      return (
        data?.publicUrl ||
        null
      );
    } catch (
      error
    ) {
      console.log("MARKETPLACE IMAGE UPLOAD ERROR:");

      throw new Error(
        getFriendlyStorageError(
          error
        ) ||
          "Unable to upload the product image."
      );
    }
  }

  /* =======================================================
     VALIDATION
  ======================================================= */

  function validateForm() {
    if (
      !sellerProfile
    ) {
      return "Please create your Seller Profile before publishing a product.";
    }

    if (
      sellerProfile
        .is_active ===
      false
    ) {
      return "Your Seller Profile is inactive. Activate it first before publishing products.";
    }

    if (
      !form.title.trim()
    ) {
      return "Please enter a product title.";
    }

    if (
      !CATEGORY_OPTIONS.some(item => item.value === form.category)
    ) {
      return "Please select a product category.";
    }

    if (
      !form.subcategory
    ) {
      return "Please select a product subcategory.";
    }

    const quantity =
      Number(
        form.quantity
      );

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      return "Please enter a valid quantity.";
    }

    if (
      isBreeder &&
      quantity !== 3
    ) {
      return "Breeder listing must contain exactly 3 crayfish: 2 females and 1 male.";
    }

    if (!UNIT_OPTIONS.some(item => item.value === form.unit)) return "Please select a valid unit.";
    if (!isCrayfish && !CONDITION_OPTIONS.some(item => item.value === form.product_condition)) {
      return "Please select a valid product condition.";
    }
    const price =
      Number(
        form.price
      );

    if (
      !Number.isFinite(
        price
      ) ||
      price <= 0 || !Number.isFinite(price * quantity)
    ) {
      return "Please enter a valid price.";
    }

    if (
      isCrayfish &&
      !form
        .crayfish_type
        .trim()
    ) {
      return "Please select a crayfish type.";
    }

    if (
      isCrayfish &&
      !form
        .size_label
        .trim()
    ) {
      return "Please enter the crayfish size.";
    }

    if (
      !form
        .seller_mobile
        .trim()
    ) {
      return "Seller mobile number is missing. Update your Seller Profile first.";
    }

    if (
      !form
        .pickup_municipality
        .trim() ||
      !form
        .pickup_barangay
        .trim()
    ) {
      return "Pickup location is incomplete. Update your Seller Profile first.";
    }

    return "";
  }

  /* =======================================================
     PUBLISH
  ======================================================= */

  async function handlePublish() {
    if (publishLock.current) return;
    setErrorText("");
    setStatusText("");

    const validationMessage =
      validateForm();

    if (
      validationMessage
    ) {
      showError(
        "Missing details",
        validationMessage
      );

      return;
    }

    publishLock.current = true;
    setSaving(true);

    try {
      setStatusText(
        "Checking account..."
      );

      const {
        data:
          userData,

        error:
          userError,
      } =
        await supabase
          .auth
          .getUser();

      if (
        userError
      ) {
        throw new Error(
          userError.message ||
            "Unable to verify login session."
        );
      }

      const user =
        userData?.user;

      if (
        !user?.id
      ) {
        throw new Error(
          "Please sign in before creating a listing."
        );
      }      const { data: currentSeller, error: sellerError } = await supabase
        .from("seller_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (sellerError) throw sellerError;
      if (!currentSeller || currentSeller.is_active === false) {
        throw new Error("An active Seller Profile is required before publishing.");
      }
      if (!currentSeller.seller_mobile || !currentSeller.pickup_municipality || !currentSeller.pickup_barangay) {
        throw new Error("Update your Seller Profile contact and pickup location before publishing.");
      }
      let imageUrl = null;

      if (
        imageAsset?.uri
      ) {
        imageUrl =
          await uploadImageIfSelected(
            user.id
          );
      }

      setStatusText(
        "Publishing product..."
      );

      const location =
        buildPickupLocation(currentSeller);

      const categoryLabel =
        getCategoryLabel(
          form.category
        );

      /*
        Backward compatibility:
        Older mobile Marketplace code still expects
        crayfish_type, stage, sex, and size_label.
      */

      const legacyCrayfishType =
        isCrayfish
          ? form.crayfish_type.trim()
          : categoryLabel;

      const legacyStage =
        isCrayfish
          ? form.stage
          : "adult";

      const legacySex =
        isCrayfish
          ? isBreeder
            ? "mixed"
            : form.sex
          : "unknown";

      const legacySize =
        isCrayfish
          ? form.size_label.trim()
          : form.subcategory ||
            "Standard";

      const finalDescription =
        isCrayfish
          ? buildFinalDescription(
              form.description,
              form.stage
            )
          : form.description.trim();

      const payload = {
        seller_id:
          user.id,

        title:
          form.title.trim(),

        category:
          form.category,

        subcategory:
          form.subcategory ||
          null,

        description:
          finalDescription ||
          null,

        price:
          Number(
            form.price
          ),

        quantity:
          isBreeder
            ? 3
            : Math.floor(
                Number(
                  form.quantity
                )
              ),

        unit:
          form.unit,

        product_condition:
          isCrayfish
            ? "not_applicable"
            : form.product_condition,

        brand:
          isCrayfish
            ? null
            : form.brand.trim() ||
              null,

        sku:
          isCrayfish
            ? null
            : form.sku.trim() ||
              null,

        is_custom_product:
          !isCrayfish &&
          Boolean(
            form.is_custom_product
          ),

        crayfish_type:
          legacyCrayfishType,

        stage:
          legacyStage,

        sex:
          legacySex,

        size_label:
          legacySize,

        location,

        pickup_municipality:
          String(currentSeller.pickup_municipality).trim(),

        pickup_municipality_code:
          currentSeller.pickup_municipality_code ||
          null,

        pickup_barangay:
          String(currentSeller.pickup_barangay).trim(),

        pickup_barangay_code:
          currentSeller.pickup_barangay_code ||
          null,

        seller_mobile:
          String(currentSeller.seller_mobile).trim(),

        image_url:
          imageUrl,

        status:
          "active",
      };

      const {
        error:
          insertError,
      } =
        await supabase
          .from(
            "marketplace_listings"
          )
          .insert(
            payload
          );

      if (
        insertError
      ) {
        console.log("MARKETPLACE INSERT ERROR:");

        throw new Error(
          getFriendlyInsertError(
            insertError
          )
        );
      }

      setStatusText(
        "Product published."
      );

      showSuccess();
    } catch (
      error
    ) {
      console.log("PUBLISH MARKETPLACE LISTING ERROR:");

      showError(
        "Publish failed",
        error?.message ||
          "Something went wrong while publishing the product."
      );
    } finally {
      publishLock.current = false;
      setSaving(false);

      setStatusText("");
    }
  }

  /* =======================================================
     RESET
  ======================================================= */

  function resetForm() {
    setForm({
      ...EMPTY_FORM,

      seller_mobile:
        sellerProfile
          ?.seller_mobile ||
        "",

      pickup_municipality:
        sellerProfile
          ?.pickup_municipality ||
        "",

      pickup_municipality_code:
        sellerProfile
          ?.pickup_municipality_code ||
        "",

      pickup_barangay:
        sellerProfile
          ?.pickup_barangay ||
        "",

      pickup_barangay_code:
        sellerProfile
          ?.pickup_barangay_code ||
        "",
    });

    setImageAsset(
      null
    );

    closeDropdowns();

    setErrorText("");

    setStatusText("");
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
          <ActivityIndicator
            size="large"
            color={
              colors.accent2
            }
          />

          <Text
            style={
              styles.loadingTitle
            }
          >
            Preparing Marketplace
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Loading your seller
            information.
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
          title="Sell Product"
          subtitle="Create a listing for crayfish, feeds, equipment, supplies, and other aquaculture products."
          icon="add-circle-outline"
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
              SELLER PROFILE
          ============================================ */}

          {!sellerProfile ? (
            <NoticeBox
              icon="alert-circle-outline"
              title="Seller Profile required"
              text="Setup your Seller Profile first before publishing Marketplace products."
              danger
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : sellerProfile
              .is_active ===
            false ? (
            <NoticeBox
              icon="pause-circle-outline"
              title="Seller Profile inactive"
              text="Activate your Seller Profile before publishing products."
              danger
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : (
            <NoticeBox
              icon="storefront-outline"
              title={
                sellerProfile
                  .store_name ||
                "Seller profile loaded"
              }
              text={`${form.pickup_barangay || "No barangay"}, ${form.pickup_municipality || "No municipality"}`}
              colors={
                colors
              }
              styles={
                styles
              }
            />
          )}

          {errorText ? (
            <ErrorBox
              message={
                errorText
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          ) : null}

          {/* ===========================================
              PHOTO
          ============================================ */}

          <SectionIntro
            title="Product photo"
            subtitle="Add a clear photo of the product."
            optional
            styles={
              styles
            }
          />

          <TouchableOpacity
            activeOpacity={
              0.86
            }
            style={
              styles.imagePicker
            }
            onPress={
              pickImage
            }
            disabled={
              saving
            }
          >
            {imageAsset?.uri ? (
              <ResilientImage
                source={{
                  uri:
                    imageAsset.uri,
                }}
                style={
                  styles.previewImage
                }
              />
            ) : (
              <View
                style={
                  styles.imageEmpty
                }
              >
                <View
                  style={
                    styles.imageEmptyIcon
                  }
                >
                  {isCrayfish ? (
                    <CrayfishIcon
                      size={42}
                      color={
                        colors.accent2
                      }
                    />
                  ) : (
                    <Ionicons
                      name={
                        selectedCategory.icon
                      }
                      size={36}
                      color={
                        colors.accent2
                      }
                    />
                  )}
                </View>

                <Text
                  style={
                    styles.imageTitle
                  }
                >
                  Add product photo
                </Text>

                <Text
                  style={
                    styles.imageText
                  }
                >
                  Choose a clear
                  image from your
                  gallery.
                </Text>
              </View>
            )}

            <View
              style={
                styles.imageOverlayButton
              }
            >
              <Ionicons
                name="image-outline"
                size={17}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.imageOverlayText
                }
              >
                {imageAsset?.uri
                  ? "Change"
                  : "Choose Photo"}
              </Text>
            </View>
          </TouchableOpacity>

          {imageAsset?.uri ? (
            <TouchableOpacity
              activeOpacity={
                0.82
              }
              style={
                styles.removeImageButton
              }
              onPress={
                removeImage
              }
              disabled={
                saving
              }
            >
              <Ionicons
                name="trash-outline"
                size={15}
                color={
                  colors.danger
                }
              />

              <Text
                style={
                  styles.removeImageText
                }
              >
                Remove photo
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* ===========================================
              CATEGORY
          ============================================ */}

          <SectionIntro
            title="Product category"
            subtitle="Choose what type of product you are selling."
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.formCard
            }
          >
            <View
              style={
                styles.categoryGrid
              }
            >
              {CATEGORY_OPTIONS.map(
                (item) => {
                  const active =
                    form.category ===
                    item.value;

                  return (
                    <TouchableOpacity
                      key={
                        item.value
                      }
                      activeOpacity={
                        0.84
                      }
                      disabled={
                        saving
                      }
                      style={[
                        styles.categoryCard,

                        active &&
                          styles.categoryCardActive,
                      ]}
                      onPress={() =>
                        selectCategory(
                          item.value
                        )
                      }
                    >
                      <View
                        style={[
                          styles.categoryIcon,

                          active &&
                            styles.categoryIconActive,
                        ]}
                      >
                        {item.value ===
                        "crayfish" ? (
                          <CrayfishIcon
                            size={24}
                            color={
                              active
                                ? "#062C2B"
                                : colors.accent2
                            }
                          />
                        ) : (
                          <Ionicons
                            name={
                              item.icon
                            }
                            size={22}
                            color={
                              active
                                ? "#062C2B"
                                : colors.accent2
                            }
                          />
                        )}
                      </View>

                      <Text
                        style={[
                          styles.categoryTitle,

                          active &&
                            styles.categoryTitleActive,
                        ]}
                      >
                        {item.label}
                      </Text>

                      <Text
                        style={
                          styles.categoryNote
                        }
                        numberOfLines={
                          2
                        }
                      >
                        {item.note}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>

            <GenericDropdown
              label="Category"
              selectedValue={
                form.category
              }
              selectedLabel={
                selectedCategory.label
              }
              options={
                CATEGORY_OPTIONS
              }
              open={
                categoryOpen
              }
              disabled={
                saving
              }
              icon={
                selectedCategory.icon
              }
              onToggle={() => {
                setCategoryOpen(
                  (previous) =>
                    !previous
                );

                setSubcategoryOpen(
                  false
                );
              }}
              onSelect={
                selectCategory
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <GenericDropdown
              label="Subcategory"
              selectedValue={
                form.subcategory
              }
              selectedLabel={
                form.subcategory
              }
              options={
                subcategories
              }
              open={
                subcategoryOpen
              }
              disabled={
                saving
              }
              icon="list-outline"
              onToggle={() => {
                setSubcategoryOpen(
                  (previous) =>
                    !previous
                );

                setCategoryOpen(
                  false
                );
              }}
              onSelect={(
                value
              ) => {
                updateForm(
                  "subcategory",
                  value
                );

                setSubcategoryOpen(
                  false
                );
              }}
              colors={
                colors
              }
              styles={
                styles
              }
            />
          </AppCard>

          {/* ===========================================
              BASIC PRODUCT DETAILS
          ============================================ */}

          <SectionIntro
            title="Product details"
            subtitle="Add the title, price, stock, and description."
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.formCard
            }
          >
            <FormInput
              label="Product title"
              value={
                form.title
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "title",
                  value
                )
              }
              placeholder={
                isCrayfish
                  ? "Example: Redclaw Juveniles"
                  : "Example: Premium Crayfish Pellet Feed"
              }
              icon="pricetag-outline"
              editable={
                !saving
              }
              focused={
                focusedField ===
                "title"
              }
              onFocus={() =>
                setFocusedField(
                  "title"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <View
              style={
                styles.twoColumnRow
              }
            >
              <View
                style={
                  styles.twoColumnItem
                }
              >
                <FormInput
                  label="Price"
                  value={
                    form.price
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateForm(
                      "price",
                      moneyOnly(
                        value
                      )
                    )
                  }
                  placeholder="250"
                  icon="cash-outline"
                  keyboardType="decimal-pad"
                  editable={
                    !saving
                  }
                  focused={
                    focusedField ===
                    "price"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "price"
                    )
                  }
                  onBlur={() =>
                    setFocusedField(
                      ""
                    )
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
              </View>

              <View
                style={
                  styles.twoColumnItem
                }
              >
                <FormInput
                  label="Quantity"
                  value={
                    form.quantity
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateForm(
                      "quantity",
                      digitsOnly(
                        value
                      )
                    )
                  }
                  placeholder="1"
                  icon="layers-outline"
                  keyboardType="numeric"
                  editable={
                    !saving &&
                    !isBreeder
                  }
                  helper={
                    isBreeder
                      ? "Fixed at 3"
                      : undefined
                  }
                  focused={
                    focusedField ===
                    "quantity"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "quantity"
                    )
                  }
                  onBlur={() =>
                    setFocusedField(
                      ""
                    )
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
              </View>
            </View>

            <GenericDropdown
              label="Unit"
              selectedValue={
                form.unit
              }
              selectedLabel={
                getOptionLabel(
                  UNIT_OPTIONS,
                  form.unit
                )
              }
              options={
                UNIT_OPTIONS
              }
              open={
                unitOpen
              }
              disabled={
                saving ||
                isBreeder
              }
              icon="cube-outline"
              onToggle={() => {
                setUnitOpen(
                  (previous) =>
                    !previous
                );

                setConditionOpen(
                  false
                );
              }}
              onSelect={(
                value
              ) => {
                updateForm(
                  "unit",
                  value
                );

                setUnitOpen(
                  false
                );
              }}
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <FormInput
              label="Description"
              optional
              value={
                form.description
              }
              onChangeText={(
                value
              ) =>
                updateForm(
                  "description",
                  value
                )
              }
              placeholder={
                isBreeder
                  ? "Add size, care, or product notes. Breeder trio note is added automatically."
                  : "Describe the product and important information buyers should know."
              }
              icon="document-text-outline"
              multiline
              editable={
                !saving
              }
              focused={
                focusedField ===
                "description"
              }
              onFocus={() =>
                setFocusedField(
                  "description"
                )
              }
              onBlur={() =>
                setFocusedField(
                  ""
                )
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />
          </AppCard>

          {/* ===========================================
              CRAYFISH ONLY
          ============================================ */}

          {isCrayfish ? (
            <>
              <SectionIntro
                title="Crayfish details"
                subtitle="These fields apply only to live crayfish."
                styles={
                  styles
                }
              />

              <AppCard
                strong
                style={
                  styles.formCard
                }
              >
                <CrayfishTypeDropdown
                  selectedType={
                    selectedType
                  }
                  value={
                    form.crayfish_type
                  }
                  open={
                    typeOpen
                  }
                  disabled={
                    saving
                  }
                  onToggle={() =>
                    setTypeOpen(
                      (previous) =>
                        !previous
                    )
                  }
                  onSelect={(
                    value
                  ) => {
                    updateForm(
                      "crayfish_type",
                      value
                    );

                    setTypeOpen(
                      false
                    );
                  }}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <FieldLabel
                  label="Stage"
                  styles={
                    styles
                  }
                />

                <View
                  style={
                    styles.optionRow
                  }
                >
                  {STAGE_OPTIONS.map(
                    (item) => (
                      <OptionChip
                        key={
                          item.value
                        }
                        label={
                          item.label
                        }
                        active={
                          form.stage ===
                          item.value
                        }
                        disabled={
                          saving
                        }
                        onPress={() =>
                          selectStage(
                            item.value
                          )
                        }
                        styles={
                          styles
                        }
                      />
                    )
                  )}
                </View>

                {isBreeder ? (
                  <BreederInfoBox
                    colors={
                      colors
                    }
                    styles={
                      styles
                    }
                  />
                ) : null}

                <FieldLabel
                  label="Sex"
                  styles={
                    styles
                  }
                />

                <View
                  style={
                    styles.optionRow
                  }
                >
                  {SEX_OPTIONS.map(
                    (item) => {
                      const disabledByBreeder =
                        isBreeder &&
                        item.value !==
                          "mixed";

                      return (
                        <OptionChip
                          key={
                            item.value
                          }
                          label={
                            item.label
                          }
                          active={
                            form.sex ===
                            item.value
                          }
                          disabled={
                            saving ||
                            disabledByBreeder
                          }
                          dimmed={
                            disabledByBreeder
                          }
                          onPress={() =>
                            selectSex(
                              item.value
                            )
                          }
                          styles={
                            styles
                          }
                        />
                      );
                    }
                  )}
                </View>

                <FormInput
                  label="Size"
                  value={
                    form.size_label
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateForm(
                      "size_label",
                      value
                    )
                  }
                  placeholder="Example: 1 inch, 2 inches, breeder size"
                  icon="resize-outline"
                  editable={
                    !saving
                  }
                  focused={
                    focusedField ===
                    "size"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "size"
                    )
                  }
                  onBlur={() =>
                    setFocusedField(
                      ""
                    )
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
              </AppCard>
            </>
          ) : (
            <>
              {/* =======================================
                  GENERAL PRODUCT DETAILS
              ======================================== */}

              <SectionIntro
                title="Product information"
                subtitle="Optional information for non-crayfish products."
                styles={
                  styles
                }
              />

              <AppCard
                strong
                style={
                  styles.formCard
                }
              >
                <GenericDropdown
                  label="Condition"
                  selectedValue={
                    form.product_condition
                  }
                  selectedLabel={
                    getOptionLabel(
                      CONDITION_OPTIONS,
                      form.product_condition
                    )
                  }
                  options={
                    CONDITION_OPTIONS
                  }
                  open={
                    conditionOpen
                  }
                  disabled={
                    saving
                  }
                  icon="shield-checkmark-outline"
                  onToggle={() => {
                    setConditionOpen(
                      (previous) =>
                        !previous
                    );

                    setUnitOpen(
                      false
                    );
                  }}
                  onSelect={(
                    value
                  ) => {
                    updateForm(
                      "product_condition",
                      value
                    );

                    setConditionOpen(
                      false
                    );
                  }}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <FormInput
                  label="Brand"
                  optional
                  value={
                    form.brand
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateForm(
                      "brand",
                      value
                    )
                  }
                  placeholder="Optional brand name"
                  icon="ribbon-outline"
                  editable={
                    !saving
                  }
                  focused={
                    focusedField ===
                    "brand"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "brand"
                    )
                  }
                  onBlur={() =>
                    setFocusedField(
                      ""
                    )
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <FormInput
                  label="SKU / Product code"
                  optional
                  value={
                    form.sku
                  }
                  onChangeText={(
                    value
                  ) =>
                    updateForm(
                      "sku",
                      value
                    )
                  }
                  placeholder="Example: FEED-001"
                  icon="barcode-outline"
                  editable={
                    !saving
                  }
                  focused={
                    focusedField ===
                    "sku"
                  }
                  onFocus={() =>
                    setFocusedField(
                      "sku"
                    )
                  }
                  onBlur={() =>
                    setFocusedField(
                      ""
                    )
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <View
                  style={
                    styles.switchRow
                  }
                >
                  <View
                    style={
                      styles.switchIcon
                    }
                  >
                    <Ionicons
                      name="build-outline"
                      size={20}
                      color={
                        colors.accent2
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.switchContent
                    }
                  >
                    <Text
                      style={
                        styles.switchTitle
                      }
                    >
                      Custom product
                    </Text>

                    <Text
                      style={
                        styles.switchText
                      }
                    >
                      Enable if this
                      product is made
                      to order.
                    </Text>
                  </View>

                  <Switch
                    value={
                      form.is_custom_product
                    }
                    onValueChange={(
                      value
                    ) =>
                      updateForm(
                        "is_custom_product",
                        value
                      )
                    }
                    disabled={
                      saving
                    }
                    trackColor={{
                      false:
                        "rgba(255,255,255,0.14)",

                      true:
                        "rgba(34,211,197,0.36)",
                    }}
                    thumbColor={
                      form.is_custom_product
                        ? colors.accent2
                        : colors.muted2
                    }
                  />
                </View>
              </AppCard>
            </>
          )}

          {/* ===========================================
              SELLER DETAILS
          ============================================ */}

          <SectionIntro
            title="Seller & pickup"
            subtitle="Loaded from your shared Seller Profile."
            badge="Bulacan"
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.formCard
            }
          >
            <ReadOnlyInfo
              icon="storefront-outline"
              label="Store"
              value={
                sellerProfile
                  ?.store_name ||
                "Marketplace Seller"
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <ReadOnlyInfo
              icon="call-outline"
              label="Mobile"
              value={
                form.seller_mobile ||
                "Not set"
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <View
              style={
                styles.rowDivider
              }
            />

            <ReadOnlyInfo
              icon="location-outline"
              label="Pickup location"
              value={
                [
                  form.pickup_barangay,
                  form.pickup_municipality,
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    ", "
                  ) ||
                "Not set"
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <View
              style={
                styles.profileNotice
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={
                  colors.accent2
                }
              />

              <Text
                style={
                  styles.profileNoticeText
                }
              >
                Change seller contact,
                pickup location, store
                name, or external shop
                links from Seller
                Profile.
              </Text>
            </View>
          </AppCard>

          {/* ===========================================
              STATUS
          ============================================ */}

          {statusText ? (
            <View
              style={
                styles.statusBox
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
                  styles.statusText
                }
              >
                {statusText}
              </Text>
            </View>
          ) : null}

          {/* ===========================================
              PUBLISH
          ============================================ */}

          <View
            style={
              styles.publishArea
            }
          >
            <AppButton
              title={
                saving
                  ? "Publishing..."
                  : "Publish Product"
              }
              icon="add-circle-outline"
              onPress={
                handlePublish
              }
              loading={
                saving
              }
              disabled={
                saving ||
                !sellerProfile ||
                sellerProfile
                  ?.is_active ===
                  false
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
          </View>
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
  optional = false,
  badge,
  styles,
}) {
  return (
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
        <Text
          style={
            styles.sectionTitle
          }
        >
          {title}
        </Text>

        {badge ? (
          <View
            style={
              styles.sectionBadge
            }
          >
            <Ionicons
              name="location-outline"
              size={11}
              color={
                COLORS.accent2
              }
            />

            <Text
              style={
                styles.sectionBadgeText
              }
            >
              {badge}
            </Text>
          </View>
        ) : optional ? (
          <Text
            style={
              styles.sectionOptional
            }
          >
            Optional
          </Text>
        ) : null}
      </View>

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
   NOTICE
========================================================= */

function NoticeBox({
  icon,
  title,
  text,
  danger = false,
  colors,
  styles,
}) {
  return (
    <View
      style={[
        styles.noticeBox,

        danger &&
          styles.noticeBoxDanger,
      ]}
    >
      <View
        style={[
          styles.noticeIcon,

          danger &&
            styles.noticeIconDanger,
        ]}
      >
        <Ionicons
          name={
            icon
          }
          size={20}
          color={
            danger
              ? colors.danger
              : colors.accent2
          }
        />
      </View>

      <View
        style={
          styles.noticeContent
        }
      >
        <Text
          style={[
            styles.noticeTitle,

            danger &&
              styles.noticeTitleDanger,
          ]}
        >
          {title}
        </Text>

        <Text
          style={
            styles.noticeText
          }
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

/* =========================================================
   FIELD LABEL
========================================================= */

function FieldLabel({
  label,
  styles,
}) {
  return (
    <Text
      style={
        styles.inputLabel
      }
    >
      {label}
    </Text>
  );
}

/* =========================================================
   CRAYFISH TYPE
========================================================= */

function CrayfishTypeDropdown({
  selectedType,
  value,
  open,
  disabled,
  onToggle,
  onSelect,
  colors,
  styles,
}) {
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
        Crayfish type
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
          <CrayfishIcon
            size={21}
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.dropdownTextWrap
          }
        >
          <Text
            style={
              styles.dropdownValue
            }
            numberOfLines={1}
          >
            {selectedType.label}
          </Text>

          <Text
            style={
              styles.dropdownNote
            }
          >
            {selectedType.note}
          </Text>
        </View>

        <Ionicons
          name={
            open
              ? "chevron-up"
              : "chevron-down"
          }
          size={18}
          color={
            colors.accent2
          }
        />
      </TouchableOpacity>

      {open ? (
        <View
          style={
            styles.dropdownMenu
          }
        >
          {CRAYFISH_TYPE_OPTIONS.map(
            (item) => {
              const active =
                item.value ===
                value;

              return (
                <TouchableOpacity
                  key={
                    item.value
                  }
                  activeOpacity={
                    0.86
                  }
                  style={[
                    styles.dropdownItem,

                    active &&
                      styles.dropdownItemActive,
                  ]}
                  onPress={() =>
                    onSelect(
                      item.value
                    )
                  }
                  disabled={
                    disabled
                  }
                >
                  <View
                    style={
                      styles.dropdownItemIcon
                    }
                  >
                    <CrayfishIcon
                      size={17}
                      color={
                        colors.accent2
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.dropdownTextWrap
                    }
                  >
                    <Text
                      style={
                        styles.dropdownItemTitle
                      }
                    >
                      {item.label}
                    </Text>

                    <Text
                      style={
                        styles.dropdownItemNote
                      }
                    >
                      {item.note}
                    </Text>
                  </View>

                  {active ? (
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
        </View>
      ) : null}
    </View>
  );
}

/* =========================================================
   GENERIC DROPDOWN
========================================================= */

function GenericDropdown({
  label,
  selectedValue,
  selectedLabel,
  options,
  open,
  disabled,
  icon,
  onToggle,
  onSelect,
  colors,
  styles,
}) {
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
              icon ||
              "list-outline"
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
            styles.dropdownTextWrap
          }
        >
          <Text
            style={
              styles.dropdownValue
            }
            numberOfLines={1}
          >
            {selectedLabel ||
              "Select option"}
          </Text>

          <Text
            style={
              styles.dropdownNote
            }
          >
            Tap to choose
          </Text>
        </View>

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
      </TouchableOpacity>

      {open ? (
        <View
          style={
            styles.dropdownMenu
          }
        >
          {options.map(
            (item) => {
              const active =
                item.value ===
                selectedValue;

              return (
                <TouchableOpacity
                  key={
                    item.value
                  }
                  activeOpacity={
                    0.86
                  }
                  style={[
                    styles.dropdownItem,

                    active &&
                      styles.dropdownItemActive,
                  ]}
                  disabled={disabled}
                  onPress={() =>
                    onSelect(
                      item.value
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
                        item.icon ||
                        icon ||
                        "ellipse-outline"
                      }
                      size={17}
                      color={
                        colors.accent2
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.dropdownTextWrap
                    }
                  >
                    <Text
                      style={
                        styles.dropdownItemTitle
                      }
                    >
                      {item.label}
                    </Text>

                    {item.note ? (
                      <Text
                        style={
                          styles.dropdownItemNote
                        }
                      >
                        {item.note}
                      </Text>
                    ) : null}
                  </View>

                  {active ? (
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
        </View>
      ) : null}
    </View>
  );
}

/* =========================================================
   INPUT
========================================================= */

function FormInput({
  label,
  optional = false,
  helper,

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

  colors,
  styles,
}) {
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

        {helper ? (
          <Text
            style={
              styles.inputHelper
            }
          >
            {helper}
          </Text>
        ) : optional ? (
          <Text
            style={
              styles.inputHelper
            }
          >
            Optional
          </Text>
        ) : null}
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
            colors.inputPlaceholder
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
   OPTION CHIP
========================================================= */

function OptionChip({
  label,
  active,
  disabled,
  dimmed,
  onPress,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.85
      }
      style={[
        styles.optionChip,

        active &&
          styles.optionChipActive,

        dimmed &&
          styles.optionChipDimmed,
      ]}
      onPress={
        onPress
      }
      disabled={
        disabled
      }
    >
      {active ? (
        <Ionicons
          name="checkmark"
          size={13}
          color="#062C2B"
        />
      ) : null}

      <Text
        style={[
          styles.optionText,

          active &&
            styles.optionTextActive,

          dimmed &&
            styles.optionTextDimmed,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* =========================================================
   BREEDER BOX
========================================================= */

function BreederInfoBox({
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.breederBox
      }
    >
      <View
        style={
          styles.breederIcon
        }
      >
        <CrayfishIcon
          size={25}
          color={
            colors.accent2
          }
        />
      </View>

      <View
        style={
          styles.breederContent
        }
      >
        <Text
          style={
            styles.breederTitle
          }
        >
          Breeder trio
        </Text>

        <Text
          style={
            styles.breederText
          }
        >
          Quantity is fixed at 3:
          2 females and 1 male.
          Sex is set to Mixed
          automatically.
        </Text>
      </View>
    </View>
  );
}

/* =========================================================
   READ ONLY
========================================================= */

function ReadOnlyInfo({
  icon,
  label,
  value,
  colors,
  styles,
}) {
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
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/* =========================================================
   ERROR
========================================================= */

function ErrorBox({
  message,
  colors,
  styles,
}) {
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
          Check listing details
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
   IMAGE HELPERS
========================================================= */

async function uriToArrayBuffer(
  uri
) {
  if (
    Platform.OS === "web"
  ) {
    const response =
      await fetch(uri);

    if (
      !response.ok
    ) {
      throw new Error(
        "Unable to read selected image."
      );
    }

    return await response.arrayBuffer();
  }

  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.exists && info.size > MAX_IMAGE_BYTES) throw new Error('Please choose a photo smaller than 5 MB.');

  const base64 =
    await FileSystem
      .readAsStringAsync(
        uri,
        {
          encoding:
            "base64",
        }
      );

  return base64ToArrayBuffer(
    base64
  );
}

function base64ToArrayBuffer(
  base64
) {
  const binaryString =
    decode(
      base64
    );

  const length =
    binaryString.length;

  const bytes =
    new Uint8Array(
      length
    );

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    bytes[index] =
      binaryString.charCodeAt(
        index
      );
  }

  return bytes.buffer;
}





/* =========================================================
   DATA HELPERS
========================================================= */

function buildPickupLocation(
  form
) {
  const barangay =
    form.pickup_barangay.trim();

  const municipality =
    form.pickup_municipality.trim();

  if (
    barangay &&
    municipality
  ) {
    return `${barangay}, ${municipality}, Bulacan`;
  }

  if (
    municipality
  ) {
    return `${municipality}, Bulacan`;
  }

  return "Bulacan";
}

function buildFinalDescription(
  description,
  stage
) {
  const cleanDescription =
    String(
      description || ""
    ).trim();

  if (
    stage !==
    "breeder"
  ) {
    return cleanDescription;
  }

  if (
    !cleanDescription
  ) {
    return BREEDER_NOTE;
  }

  if (
    cleanDescription.includes(
      BREEDER_NOTE
    )
  ) {
    return cleanDescription;
  }

  return `${cleanDescription}\n\n${BREEDER_NOTE}`;
}

function getCategoryLabel(
  value
) {
  return (
    CATEGORY_OPTIONS.find(
      (item) =>
        item.value ===
        value
    )?.label ||
    "Marketplace Product"
  );
}

function getOptionLabel(
  options,
  value
) {
  return (
    options.find(
      (item) =>
        item.value ===
        value
    )?.label ||
    value ||
    "Select"
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

function moneyOnly(
  value
) {
  const cleaned =
    String(
      value || ""
    ).replace(
      /[^0-9.]/g,
      ""
    );

  const parts =
    cleaned.split(".");

  if (
    parts.length <= 1
  ) {
    return cleaned;
  }

  return `${parts[0]}.${parts
    .slice(1)
    .join("")
    .slice(0, 2)}`;
}

function randomString() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}

/* =========================================================
   FRIENDLY ERRORS
========================================================= */

function getFriendlyStorageError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    ).toLowerCase();

  if (
    message.includes(
      "bucket"
    ) ||
    message.includes(
      "not found"
    )
  ) {
    return "Product photo storage is currently unavailable.";
  }

  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes(
      "policy"
    )
  ) {
    return "Your account does not currently have permission to upload this product photo.";
  }

  return (
    error?.message ||
    ""
  );
}

function getFriendlyInsertError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    );

  const lower =
    message.toLowerCase();

  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "policy"
    )
  ) {
    return "Your account does not currently have permission to publish this listing.";
  }

  if (
    message.includes(
      "marketplace_listings"
    )
  ) {
    return "Marketplace listing storage is currently unavailable.";
  }

  return (
    message ||
    "Unable to publish the product."
  );
}

/* =========================================================
   THEME
========================================================= */

function useThemePack() {
  const theme =
    useAppTheme();

  const isDark =
    theme?.isDark ??
    true;

  const colors =
    useMemo(() => {
      return normalizeColors(
        theme?.colors ||
          COLORS,

        isDark
      );
    }, [
      theme?.colors,
      isDark,
    ]);

  const styles =
    useMemo(() => {
      return makeStyles(
        colors
      );
    }, [
      colors,
    ]);

  return {
    colors,
    isDark,
    styles,
  };
}

function normalizeColors(
  sourceColors,
  isDark
) {
  return {
    ...COLORS,
    ...sourceColors,

    background:
      sourceColors.background ||
      (isDark
        ? COLORS.deep
        : "#F3FFFC"),

    surface:
      sourceColors.surface ||
      (isDark
        ? COLORS.surface
        : "rgba(255,255,255,0.90)"),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "#FFFFFF"),

    surfaceSoft:
      sourceColors.surfaceSoft ||
      (isDark
        ? COLORS.surfaceSoft
        : "rgba(8,31,48,0.045)"),

    textStrong:
      sourceColors.textStrong ||
      (isDark
        ? COLORS.white
        : "#0F172A"),

    muted:
      sourceColors.muted ||
      (isDark
        ? COLORS.muted
        : "rgba(15,23,42,0.68)"),

    muted2:
      sourceColors.muted2 ||
      (isDark
        ? COLORS.muted2
        : "rgba(15,23,42,0.46)"),

    border:
      sourceColors.border ||
      (isDark
        ? COLORS.border
        : "rgba(15,23,42,0.10)"),

    accent:
      sourceColors.accent ||
      COLORS.accent,

    accent2:
      sourceColors.accent2 ||
      COLORS.accent2,

    accentSoft:
      sourceColors.accentSoft ||
      (isDark
        ? COLORS.accentSoft
        : "rgba(34,211,197,0.14)"),

    accentBorder:
      sourceColors.accentBorder ||
      (isDark
        ? COLORS.accentBorder
        : "rgba(15,118,110,0.18)"),

    danger:
      sourceColors.danger ||
      COLORS.danger,

    dangerSoft:
      sourceColors.dangerSoft ||
      (isDark
        ? COLORS.dangerSoft
        : "rgba(248,113,113,0.13)"),

    success:
      sourceColors.success ||
      COLORS.success,

    successSoft:
      sourceColors.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.16)"),

    warning:
      sourceColors.warning ||
      COLORS.warning,

    inputPlaceholder:
      isDark
        ? "rgba(255,255,255,0.34)"
        : "rgba(15,23,42,0.36)",
  };
}

/* =========================================================
   STYLES
========================================================= */

/* =========================================================
   STYLES
========================================================= */

/* =========================================================
   STYLES
========================================================= */

/* =========================================================
   STYLES
========================================================= */

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
    /* LOADING */

    loadingRoot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24
    },
    loadingTitle: {
      marginTop: 14,
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700"
    },
    loadingText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12
    },
    /* SECTION */

    sectionIntro: {
      marginTop: 21,
      marginBottom: 10
    },
    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
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
    sectionOptional: {
      color: colors.muted2,
      fontSize: 12
    },
    sectionBadge: {
      minHeight: 26,
      paddingHorizontal: 8,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    sectionBadgeText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600"
    },
    /* NOTICE */

    noticeBox: {
      marginTop: 6,
      padding: 13,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    noticeBoxDanger: {
      backgroundColor: colors.dangerSoft,
      borderColor: "rgba(248,113,113,0.22)"
    },
    noticeIcon: {
      width: 39,
      height: 39,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: "rgba(255,255,255,0.04)"
    },
    noticeIconDanger: {
      backgroundColor: "rgba(248,113,113,0.08)"
    },
    noticeContent: {
      flex: 1,
      minWidth: 0
    },
    noticeTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    noticeTitleDanger: {
      color: colors.danger
    },
    noticeText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    /* IMAGE */

    imagePicker: {
      height: 205,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOW.soft
    },
    previewImage: {
      width: "100%",
      height: "100%"
    },
    imageEmpty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      backgroundColor: colors.surfaceSoft
    },
    imageEmptyIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    imageTitle: {
      marginTop: 10,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    imageText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      textAlign: "center"
    },
    imageOverlayButton: {
      position: "absolute",
      right: 11,
      bottom: 11,
      minHeight: 44,
      paddingHorizontal: 11,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(4,25,29,0.78)",
      paddingVertical: 8
    },
    imageOverlayText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700"
    },
    removeImageButton: {
      alignSelf: "flex-end",
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 8,
      paddingHorizontal: 4,
      minHeight: 44
    },
    removeImageText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "600"
    },
    /* CARD */

    formCard: {
      padding: 15,
      borderRadius: 19
    },
    /* CATEGORY */

    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 16
    },
    categoryCard: {
      width: "48.5%",
      minHeight: 132,
      marginBottom: 10,
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border
    },
    categoryCardActive: { minHeight: 44,
      backgroundColor: colors.accentSoft,
      borderColor: colors.accentBorder
    },
    categoryIcon: {
      width: 39,
      height: 39,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft
    },
    categoryIconActive: {
      backgroundColor: colors.accent2
    },
    categoryTitle: {
      marginTop: 9,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    categoryTitleActive: {
      color: colors.accent2
    },
    categoryNote: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    /* INPUT */

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
      marginBottom: 8,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
      flexShrink: 1
    },
    inputHelper: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
      flexShrink: 1
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
      borderColor: colors.accentBorder,
      backgroundColor: colors.accentSoft
    },
    formInputDisabled: {
      opacity: 0.55
    },
    formInputMultiline: {
      minHeight: 100,
      alignItems: "flex-start"
    },
    inputIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: colors.accentSoft
    },
    formTextInput: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
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
    /* TWO COLUMNS */

    twoColumnRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap"
    },
    twoColumnItem: {
      flex: 1,
      minWidth: 120
    },
    /* DROPDOWN */

    dropdownButton: {
      minHeight: 60,
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
      borderColor: colors.accentBorder,
      backgroundColor: colors.surfaceStrong
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
      marginRight: 9,
      backgroundColor: colors.accentSoft
    },
    dropdownTextWrap: {
      flex: 1,
      minWidth: 0
    },
    dropdownValue: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    dropdownNote: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12
    },
    dropdownMenu: {
      marginTop: 7,
      borderRadius: 15,
      overflow: "hidden",
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      ...SHADOW.soft
    },
    dropdownItem: {
      minHeight: 56,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    },
    dropdownItemActive: { minHeight: 44,
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
    /* OPTIONS */

    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 16
    },
    optionChip: {
      minHeight: 44,
      paddingHorizontal: 11,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 8
    },
    optionChipActive: { minHeight: 44,
      backgroundColor: colors.accent2,
      borderColor: colors.accent2
    },
    optionChipDimmed: { minHeight: 44,
      opacity: 0.35
    },
    optionText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600"
    },
    optionTextActive: {
      color: "#062C2B"
    },
    optionTextDimmed: {
      color: colors.muted2
    },
    /* BREEDER */

    breederBox: {
      marginBottom: 16,
      padding: 12,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    breederIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.surfaceSoft
    },
    breederContent: {
      flex: 1
    },
    breederTitle: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    breederText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    /* SWITCH */

    switchRow: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      padding: 11,
      borderRadius: 15,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border
    },
    switchIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor: colors.accentSoft
    },
    switchContent: {
      flex: 1,
      paddingRight: 8
    },
    switchTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    switchText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    /* READ ONLY */

    readOnlyRow: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center"
    },
    readOnlyIcon: {
      width: 39,
      height: 39,
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
      fontSize: 12
    },
    readOnlyValue: {
      marginTop: 3,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "600"
    },
    rowDivider: {
      height: 1,
      marginLeft: 49,
      backgroundColor: colors.border
    },
    profileNotice: {
      marginTop: 12,
      padding: 11,
      borderRadius: 13,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: colors.accentSoft
    },
    profileNoticeText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
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
    /* STATUS */

    statusBox: {
      marginTop: 16,
      padding: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    statusText: {
      flex: 1,
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600"
    },
    /* PUBLISH */

    publishArea: {
      marginTop: 22
    },
    cancelButton: {
      minHeight: 44,
      marginTop: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8
    },
    cancelText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600"
    }
  });
}
