// src/screens/main/MarketplaceProductDetailsScreen.js

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityIndicator, Alert, BackHandler, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
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
import { normalizeStoreUrl, reserveMarketplaceProduct } from "../../lib/marketplace";
import ResilientImage from '../../components/ui/ResilientImage';

export default function MarketplaceProductDetailsScreen({
  listing: initialListing,
  onBack,
  onChatSeller,
  onReserved,
}) {
  const { colors, styles } =
    useThemePack();

  const reserveLock = useRef(false);
  const [
    listing,
    setListing,
  ] = useState(
    initialListing || null
  );

  const [
    seller,
    setSeller,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    reserving,
    setReserving,
  ] = useState(false);

  const [
    reserveQuantity,
    setReserveQuantity,
  ] = useState("1");

  const [
    buyerNote,
    setBuyerNote,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("error");

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack?.();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const category =
    getListingCategory(
      listing
    );

  const isCrayfish =
    category ===
    "crayfish";

  const isOwner =
    Boolean(
      currentUser?.id &&
        listing?.seller_id &&
        currentUser.id ===
          listing.seller_id
    );

  const status =
    String(
      listing?.status ||
        "active"
    ).toLowerCase();

  const availableQuantity =
    Number(
      listing?.quantity ||
        0
    );

  const price =
    Number(
      listing?.price ||
        0
    );

  const reservationTotal =
    Math.max(
      0,
      Number(
        reserveQuantity ||
          0
      ) * price
    );

  const sellerMobile =
    seller?.seller_mobile ||
    listing?.seller_mobile ||
    "";

  const pickupLabel =
    [
      seller?.pickup_barangay ||
        listing?.pickup_barangay,

      seller?.pickup_municipality ||
        listing?.pickup_municipality,
    ]
      .filter(Boolean)
      .join(", ") ||
    listing?.location ||
    "Pickup location not set";

  const externalLinks =
    useMemo(() => {
      if (!seller) {
        return [];
      }

      return [
        {
          key: "shopee",
          label: "Shopee",
          icon: "bag-handle-outline",
          value:
            seller.shopee_url,
        },

        {
          key: "lazada",
          label: "Lazada",
          icon: "bag-outline",
          value:
            seller.lazada_url,
        },

        {
          key: "facebook",
          label: "Facebook",
          icon: "logo-facebook",
          value:
            seller.facebook_url,
        },

        {
          key: "tiktok",
          label: "TikTok",
          icon: "logo-tiktok",
          value:
            seller.tiktok_url,
        },

        {
          key: "website",
          label: "Website",
          icon: "globe-outline",
          value:
            seller.website_url,
        },
      ].filter(
        (item) =>
          String(
            item.value || ""
          ).trim()
      );
    }, [
      seller,
    ]);

  const loadDetails = useCallback(async (firstLoad = false) => {
    if (
      !initialListing?.id
    ) {
      setLoading(false);

      setMessage(
        "Product information is missing."
      );

      return;
    }

    if (
      firstLoad
    ) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setMessage("");

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
        console.log("PRODUCT DETAILS USER ERROR:");
      }

      const user =
        userData?.user ||
        null;

      setCurrentUser(
        user
      );

      const {
        data:
          listingData,

        error:
          listingError,
      } =
        await supabase
          .from(
            "marketplace_listings"
          )
          .select("*")
          .eq(
            "id",
            initialListing.id
          )
          .maybeSingle();

      if (
        listingError
      ) {
        setListing(null);
        throw listingError;
      }

      if (!listingData) {
        setListing(null);
        setSeller(null);
        throw new Error("This product is no longer available.");
      }

      const nextListing = listingData;

      setListing(
        nextListing
      );

      if (
        nextListing
          ?.seller_id
      ) {
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
              nextListing.seller_id
            )
            .maybeSingle();

        if (
          sellerError
        ) {
          console.log("PRODUCT DETAILS SELLER ERROR:");

          setSeller(null);
        } else {
          setSeller(
            sellerData ||
              null
          );
        }
      }
    } catch (
      error
    ) {
      console.log("LOAD PRODUCT DETAILS ERROR:");

      setMessageType("error");
      setMessage(error?.message || "Unable to load product details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialListing]);

  useEffect(() => {
    loadDetails(true);
  }, [loadDetails]);

  function handleChatSeller() {
    if (!currentUser?.id) {
      showMessage("error", "Please sign in before using chat.");
      return;
    }
    if (!listing?.seller_id || isOwner) {
      showMessage("error", "Chat user is unavailable for this transaction.");
      return;
    }
    onChatSeller?.(listing);
  }

  function showMessage(
    type,
    text
  ) {
    setMessageType(
      type
    );

    setMessage(
      text
    );
  }

  async function handleReserve() {
    if (reserveLock.current || refreshing || loading) return;
    reserveLock.current = true;
    setReserving(true);
    setMessage("");
    try {
      const { listing: latestListing, statusError } = await reserveMarketplaceProduct({
        listingId: listing?.id,
        quantity: Number(reserveQuantity),
        buyerNote,
      });
      setListing({ ...latestListing, status: statusError ? latestListing.status : "reserved" });
      setBuyerNote("");
      setReserveQuantity("1");
      const notice = statusError
        ? "Reservation saved in Orders, but the listing status could not be updated. Do not submit it again; contact the seller."
        : "Your reservation request was sent to the seller.";
      showMessage(statusError ? "error" : "success", notice);
      if (Platform.OS !== "web") {
        Alert.alert("Reservation saved", notice, [{ text: "OK", onPress: () => onReserved?.() }]);
      } else {
        onReserved?.();
      }
    } catch (error) {
      console.log("PRODUCT DETAIL RESERVE ERROR:");
      showMessage("error", error?.message || "Unable to reserve this product.");
    } finally {
      reserveLock.current = false;
      setReserving(false);
    }
  }

  async function openExternalUrl(value) {
    const url = normalizeStoreUrl(value);
    if (!url) {
      showMessage("error", "This store link is not a valid HTTP or HTTPS address.");
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (_error) {
      console.log("OPEN EXTERNAL STORE ERROR:");
      showMessage("error", "Unable to open this store link.");
    }
  }

  async function callSeller() {
    if (
      !sellerMobile
    ) {
      showMessage(
        "error",
        "Seller mobile number is unavailable."
      );

      return;
    }

    try {
      const number = String(sellerMobile).replace(/[^+0-9]/g, "");
      if (!/^[+]?[0-9]{10,15}$/.test(number)) throw new Error("Invalid mobile number");
      const url = `tel:${number}`;

      await Linking.openURL(
        url
      );
    } catch (
      _error
    ) {
      console.log("CALL SELLER ERROR:");

      showMessage(
        "error",
        "Unable to open the phone app."
      );
    }
  }

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
            Loading Product
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Getting Marketplace
            product details.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={17} color={colors.accent2} />
            <Text style={styles.backButtonText}>Back to Marketplace</Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  if (
    !listing
  ) {
    return (
      <AppScreen keyboard>
        <View
          style={
            styles.root
          }
        >
          <AppHeader
            eyebrow="Marketplace"
            title="Product Details"
            subtitle="Marketplace product information"
            icon="storefront-outline"
            rightAction="arrow-back"
            onRightPress={
              onBack
            }
          />

          <View
            style={
              styles.emptyState
            }
          >
            <Ionicons
              name="alert-circle-outline"
              size={32}
              color={
                colors.danger
              }
            />

            <Text
              style={
                styles.emptyTitle
              }
            >
              Product unavailable
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {message ||
                "This product could not be loaded."}
            </Text>
          </View>
        </View>
      </AppScreen>
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
          eyebrow="Marketplace"
          title="Product Details"
          subtitle="Review the product and seller information."
          icon="storefront-outline"
          rightAction="arrow-back"
          onRightPress={
            onBack
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.scroll
          }
        >
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

          <TouchableOpacity
            style={
              styles.refreshButton
            }
            onPress={() =>
              loadDetails(false)
            }
            disabled={
              refreshing
            }
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color={
                  colors.accent2
                }
              />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={15}
                color={
                  colors.accent2
                }
              />
            )}

            <Text
              style={
                styles.refreshText
              }
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh Product"}
            </Text>
          </TouchableOpacity>

          <View
            style={
              styles.imageCard
            }
          >
            {listing.image_url ? (
              <ResilientImage
                source={{
                  uri:
                    listing.image_url,
                }}
                style={
                  styles.productImage
                }
                resizeMode="cover"
              />
            ) : (
              <View
                style={
                  styles.imagePlaceholder
                }
              >
                {isCrayfish ? (
                  <CrayfishIcon
                    size={72}
                    color={
                      colors.accent2
                    }
                  />
                ) : (
                  <Ionicons
                    name={getCategoryIcon(
                      category
                    )}
                    size={60}
                    color={
                      colors.accent2
                    }
                  />
                )}

                <Text
                  style={
                    styles.imagePlaceholderText
                  }
                >
                  No product image
                </Text>
              </View>
            )}

            <View
              style={
                styles.imageBadges
              }
            >
              <View
                style={
                  styles.categoryBadge
                }
              >
                <Ionicons
                  name={getCategoryIcon(
                    category
                  )}
                  size={12}
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
          </View>

          <AppCard
            strong
            style={
              styles.mainCard
            }
          >
            <Text
              style={
                styles.productTitle
              }
            >
              {listing.title ||
                "Marketplace Product"}
            </Text>

            <Text
              style={
                styles.productSubcategory
              }
            >
              {formatFriendly(
                listing.subcategory ||
                  (isCrayfish
                    ? listing.stage
                    : "Product")
              )}
            </Text>

            <View
              style={
                styles.priceRow
              }
            >
              <Text
                style={
                  styles.price
                }
              >
                {formatPeso(
                  listing.price
                )}
              </Text>

              <Text
                style={
                  styles.unitText
                }
              >
                /{" "}
                {formatUnit(
                  listing.unit,
                  1
                )}
              </Text>
            </View>

            <View
              style={
                styles.quickGrid
              }
            >
              <QuickStat
                icon="layers-outline"
                label="Stock"
                value={`${availableQuantity} ${formatUnit(
                  listing.unit,
                  availableQuantity
                )}`}
                colors={
                  colors
                }
                styles={
                  styles
                }
              />

              <QuickStat
                icon="pricetag-outline"
                label="Category"
                value={getCategoryLabel(
                  category
                )}
                colors={
                  colors
                }
                styles={
                  styles
                }
              />

              <QuickStat
                icon="location-outline"
                label="Pickup"
                value={seller?.pickup_municipality || listing.pickup_municipality || "Not set"}
                colors={
                  colors
                }
                styles={
                  styles
                }
              />

              <QuickStat
                icon="cube-outline"
                label="Unit"
                value={formatFriendly(
                  listing.unit ||
                    "piece"
                )}
                colors={
                  colors
                }
                styles={
                  styles
                }
              />
            </View>
          </AppCard>

          <SectionTitle
            title={
              isCrayfish
                ? "Crayfish Information"
                : "Product Information"
            }
            subtitle={
              isCrayfish
                ? "Details about this live crayfish listing."
                : "Additional details provided by the seller."
            }
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.detailsCard
            }
          >
            {isCrayfish ? (
              <>
                <DetailRow
                  icon="fish-outline"
                  label="Crayfish Type"
                  value={
                    listing.crayfish_type ||
                    "Redclaw Crayfish"
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="analytics-outline"
                  label="Stage"
                  value={formatFriendly(
                    listing.stage
                  )}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="male-female-outline"
                  label="Sex"
                  value={formatFriendly(
                    listing.sex
                  )}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="resize-outline"
                  label="Size"
                  value={
                    listing.size_label ||
                    "Not specified"
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
                {String(listing.stage || "").toLowerCase() === "breeder" ? (
                  <DetailRow icon="people-outline" label="Breeder Trio"
                    value="2 females + 1 male (3 crayfish)" colors={colors} styles={styles} />
                ) : null}
              </>
            ) : (
              <>
                <DetailRow
                  icon="list-outline"
                  label="Subcategory"
                  value={formatFriendly(
                    listing.subcategory
                  )}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="ribbon-outline"
                  label="Brand"
                  value={
                    listing.brand ||
                    "Not specified"
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="shield-checkmark-outline"
                  label="Condition"
                  value={formatFriendly(
                    listing.product_condition ||
                      "Not Applicable"
                  )}
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="barcode-outline"
                  label="SKU"
                  value={
                    listing.sku ||
                    "Not specified"
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />

                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="build-outline"
                  label="Custom Product"
                  value={
                    listing.is_custom_product
                      ? "Yes"
                      : "No"
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
              </>
            )}
          </AppCard>

          <SectionTitle
            title="Description"
            subtitle="Product notes from the seller."
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.descriptionCard
            }
          >
            <Text
              style={
                styles.descriptionText
              }
            >
              {listing.description ||
                "No additional description was provided for this product."}
            </Text>
          </AppCard>

          <SectionTitle
            title="Seller Information"
            subtitle="Contact and pickup details for this product."
            styles={
              styles
            }
          />

          <AppCard
            strong
            style={
              styles.sellerCard
            }
          >
            <View
              style={
                styles.storeHeader
              }
            >
              <View
                style={
                  styles.storeIcon
                }
              >
                <Ionicons
                  name="storefront-outline"
                  size={24}
                  color={
                    colors.accent2
                  }
                />
              </View>

              <View
                style={
                  styles.storeContent
                }
              >
                <Text
                  style={
                    styles.storeName
                  }
                >
                  {seller?.store_name ||
                    "CrayThrive Seller"}
                </Text>

                <Text
                  style={
                    styles.storeDescription
                  }
                >
                  {seller?.store_description ||
                    "Marketplace seller"}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.sellerDivider
              }
            />

            <DetailRow
              icon="call-outline"
              label="Mobile"
              value={
                sellerMobile ||
                "Not provided"
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            <Divider
              styles={
                styles
              }
            />

            <DetailRow
              icon="location-outline"
              label="Pickup Location"
              value={
                pickupLabel
              }
              colors={
                colors
              }
              styles={
                styles
              }
            />

            {seller?.pickup_note ? (
              <>
                <Divider
                  styles={
                    styles
                  }
                />

                <DetailRow
                  icon="information-circle-outline"
                  label="Pickup Note"
                  value={
                    seller.pickup_note
                  }
                  colors={
                    colors
                  }
                  styles={
                    styles
                  }
                />
              </>
            ) : null}

            {!isOwner ? (
              <View
                style={
                  styles.sellerActions
                }
              >
                <TouchableOpacity
                  activeOpacity={
                    0.84
                  }
                  style={
                    styles.secondaryAction
                  }
                  onPress={handleChatSeller}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color={
                      colors.accent2
                    }
                  />

                  <Text
                    style={
                      styles.secondaryActionText
                    }
                  >
                    Chat Seller
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={
                    0.84
                  }
                  style={
                    styles.secondaryAction
                  }
                  onPress={
                    callSeller
                  }
                >
                  <Ionicons
                    name="call-outline"
                    size={16}
                    color={
                      colors.accent2
                    }
                  />

                  <Text
                    style={
                      styles.secondaryActionText
                    }
                  >
                    Call
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={
                  styles.ownerNotice
                }
              >
                <Ionicons
                  name="person-circle-outline"
                  size={18}
                  color={
                    colors.accent2
                  }
                />

                <Text
                  style={
                    styles.ownerNoticeText
                  }
                >
                  This product belongs
                  to your seller
                  account.
                </Text>
              </View>
            )}
          </AppCard>

          {externalLinks.length >
          0 ? (
            <>
              <SectionTitle
                title="Online Stores"
                subtitle="Visit the seller's other online shops."
                styles={
                  styles
                }
              />

              <AppCard
                strong
                style={
                  styles.linksCard
                }
              >
                {externalLinks.map(
                  (
                    item,
                    index
                  ) => (
                    <React.Fragment
                      key={
                        item.key
                      }
                    >
                      <TouchableOpacity
                        activeOpacity={
                          0.84
                        }
                        style={
                          styles.shopLink
                        }
                        onPress={() =>
                          openExternalUrl(
                            item.value
                          )
                        }
                      >
                        <View
                          style={
                            styles.shopLinkIcon
                          }
                        >
                          <Ionicons
                            name={
                              item.icon
                            }
                            size={19}
                            color={
                              colors.accent2
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.shopLinkContent
                          }
                        >
                          <Text
                            style={
                              styles.shopLinkTitle
                            }
                          >
                            {
                              item.label
                            }
                          </Text>

                          <Text
                            style={
                              styles.shopLinkText
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {
                              item.value
                            }
                          </Text>
                        </View>

                        <Ionicons
                          name="open-outline"
                          size={16}
                          color={
                            colors.muted2
                          }
                        />
                      </TouchableOpacity>

                      {index <
                      externalLinks.length -
                        1 ? (
                        <Divider
                          styles={
                            styles
                          }
                        />
                      ) : null}
                    </React.Fragment>
                  )
                )}
              </AppCard>
            </>
          ) : null}

          {!isOwner ? (
            <>
              <SectionTitle
                title="Reserve Product"
                subtitle={
                  status === "active"
                    ? "Send a reservation request to the seller."
                    : "This product is not currently available for reservation."
                }
                styles={
                  styles
                }
              />

              <AppCard
                strong
                style={
                  styles.reserveCard
                }
              >
                {status ===
                "active" ? (
                  <>
                    <Text
                      style={
                        styles.inputLabel
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
                        styles.input
                      }
                    />

                    <Text
                      style={
                        styles.stockHint
                      }
                    >
                      Available:{" "}
                      {availableQuantity}{" "}
                      {formatUnit(
                        listing.unit,
                        availableQuantity
                      )}
                    </Text>

                    <Text
                      style={
                        styles.inputLabel
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
                      placeholder="Optional message for the seller"
                      placeholderTextColor={
                        colors.inputPlaceholder
                      }
                      multiline
                      style={[
                        styles.input,
                        styles.textArea,
                      ]}
                    />

                    <View
                      style={
                        styles.totalCard
                      }
                    >
                      <Text
                        style={
                          styles.totalLabel
                        }
                      >
                        Estimated Total
                      </Text>

                      <Text
                        style={
                          styles.totalValue
                        }
                      >
                        {formatPeso(
                          reservationTotal
                        )}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={
                        0.86
                      }
                      style={[
                        styles.reserveButton,

                        reserving &&
                          styles.disabledButton,
                      ]}
                      onPress={
                        handleReserve
                      }
                      disabled={reserving || refreshing}
                    >
                      {reserving ? (
                        <ActivityIndicator
                          size="small"
                          color="#062C2B"
                        />
                      ) : (
                        <Ionicons
                          name="cart-outline"
                          size={18}
                          color="#062C2B"
                        />
                      )}

                      <Text
                        style={
                          styles.reserveButtonText
                        }
                      >
                        {reserving
                          ? "Sending Reservation..."
                          : "Reserve Product"}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View
                    style={
                      styles.unavailableBox
                    }
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={22}
                      color={
                        colors.warning
                      }
                    />

                    <Text
                      style={
                        styles.unavailableText
                      }
                    >
                      This product is
                      currently{" "}
                      {formatFriendly(
                        status
                      )}
                      .
                    </Text>
                  </View>
                )}
              </AppCard>
            </>
          ) : null}

          <TouchableOpacity
            activeOpacity={
              0.84
            }
            style={
              styles.backButton
            }
            onPress={
              onBack
            }
          >
            <Ionicons
              name="arrow-back"
              size={17}
              color={
                colors.accent2
              }
            />

            <Text
              style={
                styles.backButtonText
              }
            >
              Back to Marketplace
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function SectionTitle({
  title,
  subtitle,
  styles,
}) {
  return (
    <View
      style={
        styles.sectionHeader
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

function QuickStat({
  icon,
  label,
  value,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.quickStat
      }
    >
      <View
        style={
          styles.quickIcon
        }
      >
        <Ionicons
          name={
            icon
          }
          size={16}
          color={
            colors.accent2
          }
        />
      </View>

      <Text
        style={
          styles.quickLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.quickValue
        }
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.detailRow
      }
    >
      <View
        style={
          styles.detailIcon
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
          styles.detailContent
        }
      >
        <Text
          style={
            styles.detailLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.detailValue
          }
        >
          {value ||
            "Not specified"}
        </Text>
      </View>
    </View>
  );
}

function Divider({
  styles,
}) {
  return (
    <View
      style={
        styles.divider
      }
    />
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

function MessageBox({
  type,
  message,
  colors,
  styles,
}) {
  const success =
    type ===
    "success";

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

function getListingCategory(
  listing
) {
  return String(
    listing?.category ||
      "crayfish"
  )
    .trim()
    .toLowerCase();
}

function getCategoryLabel(
  value
) {
  const map = {
    crayfish:
      "Crayfish",

    feeds:
      "Feeds",

    tanks_enclosures:
      "Tanks & Enclosures",

    water_care:
      "Water Care",

    test_kits:
      "Test Kits",

    equipment:
      "Equipment",

    accessories:
      "Accessories",

    others:
      "Others",
  };

  return (
    map[value] ||
    "Other"
  );
}

function getCategoryIcon(
  value
) {
  const map = {
    crayfish:
      "fish-outline",

    feeds:
      "nutrition-outline",

    tanks_enclosures:
      "cube-outline",

    water_care:
      "water-outline",

    test_kits:
      "flask-outline",

    equipment:
      "construct-outline",

    accessories:
      "hardware-chip-outline",

    others:
      "ellipsis-horizontal-circle-outline",
  };

  return (
    map[value] ||
    "cube-outline"
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

function formatFriendly(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  if (!text) {
    return "Not specified";
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
      (character) =>
        character.toUpperCase()
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

  const values = {
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

    kg:
      "kg",

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
    values[unit] ||
    unit
  );
}

function getStatusTone(
  status,
  colors
) {
  if (
    [
      "completed",
      "sold",
    ].includes(
      status
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
      "reserved",
      "pending",
    ].includes(
      status
    )
  ) {
    return {
      background:
        colors.warningSoft,

      text:
        colors.warning,
    };
  }

  if (
    [
      "deleted",
      "cancelled",
    ].includes(
      status
    )
  ) {
    return {
      background:
        colors.dangerSoft,

      text:
        colors.danger,
    };
  }

  return {
    background:
      colors.accentSoft,

    text:
      colors.accent2,
  };
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
        : "rgba(248,113,113,0.13)"),

    success:
      source.success ||
      COLORS.success,

    successSoft:
      source.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.15)"),

    warning:
      source.warning ||
      COLORS.warning,

    warningSoft:
      source.warningSoft ||
      (isDark
        ? COLORS.warningSoft
        : "rgba(251,191,36,0.15)"),

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
    loadingRoot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24
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
    emptyState: {
      flex: 1,
      minHeight: 400,
      alignItems: "center",
      justifyContent: "center"
    },
    emptyTitle: {
      marginTop: 10,
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700"
    },
    emptyText: {
      marginTop: 5,
      color: colors.muted,
      fontSize: 12,
      textAlign: "center"
    },
    messageBox: {
      marginBottom: 11,
      padding: 11,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1
    },
    messageSuccess: {
      backgroundColor: colors.successSoft,
      borderColor: "rgba(74,222,128,0.20)"
    },
    messageError: {
      backgroundColor: colors.dangerSoft,
      borderColor: "rgba(248,113,113,0.20)"
    },
    messageText: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 12,
      lineHeight: 18
    },
    refreshButton: {
      alignSelf: "flex-end",
      minHeight: 44,
      marginBottom: 9,
      paddingHorizontal: 10,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      paddingVertical: 8
    },
    refreshText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    imageCard: {
      height: 265,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOW.soft
    },
    productImage: {
      width: "100%",
      height: "100%"
    },
    imagePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    imagePlaceholderText: {
      marginTop: 8,
      color: colors.muted,
      fontSize: 12
    },
    imageBadges: {
      position: "absolute",
      left: 11,
      right: 11,
      bottom: 11,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center"
    },
    categoryBadge: {
      minHeight: 28,
      paddingHorizontal: 9,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.accentBorder
    },
    categoryBadgeText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    statusBadge: {
      minHeight: 28,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      justifyContent: "center"
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: "700"
    },
    mainCard: {
      marginTop: 12,
      padding: 15,
      borderRadius: 20
    },
    productTitle: {
      color: colors.textStrong,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "800"
    },
    productSubcategory: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12
    },
    priceRow: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "flex-end"
    },
    price: {
      color: colors.accent2,
      fontSize: 24,
      fontWeight: "800"
    },
    unitText: {
      marginLeft: 4,
      marginBottom: 3,
      color: colors.muted2,
      fontSize: 12
    },
    quickGrid: {
      marginTop: 15,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between"
    },
    quickStat: {
      width: "48.5%",
      minHeight: 92,
      marginBottom: 9,
      padding: 11,
      borderRadius: 14,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border
    },
    quickIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft
    },
    quickLabel: {
      marginTop: 7,
      color: colors.muted2,
      fontSize: 12
    },
    quickValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    sectionHeader: {
      marginTop: 22,
      marginBottom: 10
    },
    sectionTitle: {
      color: colors.textStrong,
      fontSize: 15.5,
      fontWeight: "700",
      flexShrink: 1
    },
    sectionSubtitle: {
      marginTop: 3,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 18
    },
    detailsCard: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 19
    },
    detailRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center"
    },
    detailIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    detailContent: {
      flex: 1,
      minWidth: 0
    },
    detailLabel: {
      color: colors.muted2,
      fontSize: 12
    },
    detailValue: {
      marginTop: 3,
      color: colors.textStrong,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600"
    },
    divider: {
      height: 1,
      marginLeft: 48,
      backgroundColor: colors.border
    },
    descriptionCard: {
      padding: 15,
      borderRadius: 18
    },
    descriptionText: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    sellerCard: {
      padding: 14,
      borderRadius: 19
    },
    storeHeader: {
      flexDirection: "row",
      alignItems: "center"
    },
    storeIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    storeContent: {
      flex: 1,
      minWidth: 0
    },
    storeName: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700"
    },
    storeDescription: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18
    },
    sellerDivider: {
      height: 1,
      marginVertical: 12,
      backgroundColor: colors.border
    },
    sellerActions: {
      marginTop: 13,
      flexDirection: "row",
      gap: 8
    },
    secondaryAction: {
      flex: 1,
      minHeight: 44,
      borderRadius: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      paddingVertical: 8
    },
    secondaryActionText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    },
    ownerNotice: {
      marginTop: 12,
      padding: 11,
      borderRadius: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: colors.accentSoft
    },
    ownerNoticeText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12
    },
    linksCard: {
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 19
    },
    shopLink: {
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center"
    },
    shopLinkIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: colors.accentSoft
    },
    shopLinkContent: {
      flex: 1,
      minWidth: 0
    },
    shopLinkTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700"
    },
    shopLinkText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12
    },
    reserveCard: {
      padding: 15,
      borderRadius: 19
    },
    inputLabel: {
      marginBottom: 7,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
      flexShrink: 1
    },
    input: {
      minHeight: 50,
      marginBottom: 9,
      paddingHorizontal: 12,
      borderRadius: 14,
      color: colors.textStrong,
      backgroundColor: colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14
    },
    textArea: {
      minHeight: 88,
      paddingTop: 11,
      textAlignVertical: "top"
    },
    stockHint: {
      marginTop: -3,
      marginBottom: 15,
      color: colors.muted2,
      fontSize: 12
    },
    totalCard: {
      marginTop: 7,
      padding: 13,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.accentSoft
    },
    totalLabel: {
      color: colors.muted,
      fontSize: 12
    },
    totalValue: {
      color: colors.accent2,
      fontSize: 16,
      fontWeight: "800"
    },
    reserveButton: {
      minHeight: 48,
      marginTop: 12,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
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
    unavailableBox: {
      minHeight: 80,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 14,
      backgroundColor: colors.warningSoft
    },
    unavailableText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "600"
    },
    backButton: {
      minHeight: 45,
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8
    },
    backButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700"
    }
  });
}