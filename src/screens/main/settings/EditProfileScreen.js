import { validateSelectedImage, validateImageBytes, MAX_IMAGE_BYTES } from '../../../utils/uploadSecurity';
// src/screens/main/settings/EditProfileScreen.js

import { Ionicons } from "@expo/vector-icons";
import { decode } from "base-64";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import AppButton from "../../../components/ui/AppButton";
import AppCard from "../../../components/ui/AppCard";
import AppHeader from "../../../components/ui/AppHeader";
import AppScreen from "../../../components/ui/AppScreen";
import BrandLogo from "../../../components/ui/BrandLogo";
import { SHADOW } from "../../../constants/theme";
import { supabase } from "../../../lib/supabase";
import useThemedStyles from '../../../hooks/useThemedStyles';
import useSingleFlight from '../../../hooks/useSingleFlight';
import ResilientImage from '../../../components/ui/ResilientImage';

const BUCKET_NAME = "profile-avatars";

export default function EditProfileScreen({
  onBack,
  onProfileUpdated,
}) {
  const [profileLoaded, setProfileLoaded] = useState(false);

  const { colors, styles } = useThemedStyles(makeStyles);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] =
    useState("");

  const [avatarUrl, setAvatarUrl] = useState("");
  const [selectedImage, setSelectedImage] =
    useState(null);

  const [focusedField, setFocusedField] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const cleanUsername = useMemo(
    () => username.trim(),
    [username]
  );

  const displayUsername = useMemo(() => {
    return cleanUsername || "Add a username";
  }, [cleanUsername]);

  const previewUri =
    selectedImage?.uri || avatarUrl || "";

  const usernameChanged =
    cleanUsername !== initialUsername;

  const avatarChanged =
    Boolean(selectedImage?.uri);

  const hasChanges =
    usernameChanged || avatarChanged;

  function showError(title, message) {
    setErrorText(message || title);

    if (Platform.OS !== "web") {
      Alert.alert(title, message);
    }
  }

  function showNotice(title, message, onPress) {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.alert(
          `${title}\n\n${message}`
        );
      }

      if (onPress) {
        onPress();
      }

      return;
    }

    Alert.alert(title, message, [
      {
        text: "OK",
        onPress,
      },
    ]);
  }

  async function loadProfile() {
    setProfileLoaded(false);

    setLoading(true);
    setErrorText("");

    try {
      const { data, error } =
        await supabase.auth.getUser();

      if (error) {
        throw new Error(
          error.message ||
            "Unable to load user profile."
        );
      }

      const user = data?.user;

      if (!user?.id) {
        throw new Error(
          "No logged in user found. Please sign in again."
        );
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar_url"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(
          getFriendlyProfileError(
            profileError
          )
        );
      }

      const dbUsername =
        profileData?.username || "";

      const dbAvatarUrl =
        profileData?.avatar_url || "";

      setUsername(dbUsername);
      setInitialUsername(dbUsername);
      setAvatarUrl(dbAvatarUrl);
    
      setProfileLoaded(true);
} catch (error) {
      console.log("LOAD EDIT PROFILE ERROR:");

      setErrorText(
        error?.message ||
          "Unable to load profile."
      );
    } finally {
      setLoading(false);
    }
  }

  const pickAvatar = useSingleFlight(async function pickAvatar() {
    setErrorText("");

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showError(
          "Gallery permission needed",
          "Please allow gallery access to choose a profile photo."
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes:
            ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.75,
          base64: false,
        });

      if (result.canceled) {
        return;
      }

      const asset =
        result.assets?.[0];

      if (!asset?.uri) {
        showError(
          "No image selected",
          "Please select a valid profile image."
        );

        return;
      }

      setSelectedImage(asset);
    } catch (error) {
      console.log("PICK PROFILE IMAGE ERROR:");

      showError(
        "Image picker failed",
        error?.message ||
          "Unable to select profile image."
      );
    }
  });

  function removeSelectedImage() {
    setSelectedImage(null);
    setErrorText("");
  }

  function validateProfile() {
    if (!cleanUsername) {
      return "";
    }

    if (cleanUsername.length < 3) {
      return "Username must be at least 3 characters.";
    }

    if (cleanUsername.length > 30) {
      return "Username must be 30 characters or less.";
    }

    return "";
  }

  async function uploadAvatarIfSelected() {
    if (!selectedImage?.uri) {
      return avatarUrl || "";
    }

    if (!userId) {
      throw new Error(
        "User session is missing. Please sign in again."
      );
    }

    setStatusText(
      "Preparing profile photo..."
    );

    validateSelectedImage(selectedImage);

    try {
      const arrayBuffer =
        await uriToArrayBuffer(
          selectedImage.uri
        );

      const { fileExt, contentType } = validateImageBytes(arrayBuffer);
      const filePath = `${userId}/avatar-${Date.now()}-${randomString()}.${fileExt}`;

      setStatusText(
        "Uploading profile photo..."
      );

      const { error: uploadError } =
        await supabase.storage
          .from(BUCKET_NAME)
          .upload(
            filePath,
            arrayBuffer,
            {
              contentType,
              upsert: true,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      const { data } =
        supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filePath);

      return data?.publicUrl || "";
    } catch (error) {
      console.log("UPLOAD PROFILE AVATAR ERROR:");

      throw new Error(
        getFriendlyStorageError(error) ||
          "Profile photo upload failed. Please check profile photo storage."
      );
    }
  }

  async function updateProfileRow(
    updatePayload
  ) {
    const {
      data: existingProfile,
      error: checkError,
    } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (checkError) {
      throw new Error(
        getFriendlyProfileError(
          checkError
        )
      );
    }

    if (!existingProfile?.id) {
      throw new Error(
        "Profile record was not found. Please make sure your profile exists first."
      );
    }

    const { error: updateError } =
      await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", userId);

    if (updateError) {
      throw new Error(
        getFriendlyProfileError(
          updateError
        )
      );
    }
  }

  async function updateAuthMetadata(
    updatePayload
  ) {
    const metadataPayload = {};

    if (
      Object.prototype.hasOwnProperty.call(
        updatePayload,
        "username"
      )
    ) {
      metadataPayload.username =
        updatePayload.username || null;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        updatePayload,
        "avatar_url"
      )
    ) {
      metadataPayload.avatar_url =
        updatePayload.avatar_url || null;
    }

    if (
      Object.keys(metadataPayload)
        .length === 0
    ) {
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        data: metadataPayload,
      });

    if (error) {
      console.log("AUTH METADATA UPDATE WARNING:");
    }
  }

  const handleSaveProfile = useSingleFlight(async function handleSaveProfile() {
    if (!profileLoaded) { showError("Profile unavailable", "Reload your profile before saving changes."); return; }

    setErrorText("");
    setStatusText("");

    const validationMessage =
      validateProfile();

    if (validationMessage) {
      showError(
        "Profile update failed",
        validationMessage
      );

      return;
    }

    if (!userId) {
      showError(
        "Profile update failed",
        "User session is missing."
      );

      return;
    }

    if (!hasChanges) {
      showNotice(
        "No changes",
        "There is nothing to save."
      );

      return;
    }

    setSaving(true);

    try {
      const updatePayload = {};

      if (usernameChanged) {
        updatePayload.username =
          cleanUsername || null;
      }

      if (avatarChanged) {
        setStatusText(
          "Uploading profile photo..."
        );

        const nextAvatarUrl =
          await uploadAvatarIfSelected();

        updatePayload.avatar_url =
          nextAvatarUrl || null;
      }

      setStatusText(
        "Saving profile..."
      );

      await updateProfileRow(
        updatePayload
      );

      await updateAuthMetadata(
        updatePayload
      );

      if (usernameChanged) {
        setUsername(cleanUsername);
        setInitialUsername(
          cleanUsername
        );
      }

      if (avatarChanged) {
        setAvatarUrl(
          updatePayload.avatar_url ||
            ""
        );

        setSelectedImage(null);
      }

      showNotice(
        "Profile updated",
        "Your profile was saved successfully.",
        () => {
          onProfileUpdated?.();
          onBack?.();
        }
      );
    } catch (error) {
      console.log("SAVE PROFILE ERROR:");

      showError(
        "Profile update failed",
        error?.message ||
          "Unable to save profile."
      );
    } finally {
      setSaving(false);
      setStatusText("");
    }
  });

  if (loading) {
    return (
      <AppScreen keyboard onBack={onBack} backDisabled={saving}>
        <View
          style={styles.loadingRoot}
        >
          <View
            style={
              styles.loadingIcon
            }
          >
            <ActivityIndicator
              color={colors.accent2}
            />
          </View>

          <Text
            style={
              styles.loadingTitle
            }
          >
            Loading profile
          </Text>

          <Text
            style={
              styles.loadingText
            }
          >
            Getting your account details.
          </Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboard onBack={onBack} backDisabled={saving}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="Account"
          title="Edit Profile"
          subtitle="Update your username and profile photo."
          icon="person-outline"
          rightAction="close-outline"
          onRightPress={
            saving ? undefined : onBack
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.scroll
          }
        >
          <AppCard
            strong
            style={
              styles.profileCard
            }
          >
            <TouchableOpacity
              activeOpacity={0.86}
              style={
                styles.avatarButton
              }
              onPress={pickAvatar}
              disabled={saving}
            >
              {previewUri ? (
                <ResilientImage
                  source={{
                    uri: previewUri,
                  }}
                  style={
                    styles.avatarImage
                  }
                />
              ) : (
                <BrandLogo size={76} />
              )}

              <View
                style={
                  styles.cameraBadge
                }
              >
                <Ionicons
                  name="camera-outline"
                  size={17}
                  color={colors.deep}
                />
              </View>
            </TouchableOpacity>

            <View
              style={
                styles.profileInfo
              }
            >
              <Text
                style={
                  styles.profileName
                }
                numberOfLines={1}
              >
                {displayUsername}
              </Text>

              <Text
                style={
                  styles.profileEmail
                }
                numberOfLines={1}
              >
                {email}
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={pickAvatar}
                disabled={saving}
                style={
                  styles.photoAction
                }
              >
                <Ionicons
                  name="image-outline"
                  size={14}
                  color={
                    colors.accent2
                  }
                />

                <Text
                  style={
                    styles.photoActionText
                  }
                >
                  {previewUri
                    ? "Change photo"
                    : "Add photo"}
                </Text>
              </TouchableOpacity>
            </View>
          </AppCard>

          {selectedImage?.uri ? (
            <View
              style={
                styles.selectedPhotoBox
              }
            >
              <View
                style={
                  styles.selectedPhotoIcon
                }
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={
                    colors.success
                  }
                />
              </View>

              <View
                style={
                  styles.selectedPhotoContent
                }
              >
                <Text
                  style={
                    styles.selectedPhotoTitle
                  }
                >
                  New photo selected
                </Text>

                <Text
                  style={
                    styles.selectedPhotoText
                  }
                >
                  It will be uploaded when
                  you save your profile.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={
                  styles.removeButton
                }
                onPress={
                  removeSelectedImage
                }
                disabled={saving}
              >
                <Ionicons
                  name="close"
                  size={17}
                  color={colors.danger}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          {errorText ? (
            <View
              style={styles.errorBox}
            >
              <View
                style={
                  styles.errorIcon
                }
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={19}
                  color={colors.danger}
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
                  Unable to continue
                </Text>

                <Text
                  style={
                    styles.errorText
                  }
                >
                  {errorText}
                </Text>
              </View>
            </View>
          ) : null}

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
              Profile details
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              Your username is shown
              across your CrayThrive
              account.
            </Text>
          </View>

          <AppCard
            strong
            style={styles.formCard}
          >
            <FormInput
              label="Username"
              value={username}
              onChangeText={(value) => {
                setUsername(value);

                if (errorText) {
                  setErrorText("");
                }
              }}
              placeholder="Enter username"
              icon="at-outline"
              editable={!saving}
              focused={
                focusedField ===
                "username"
              }
              onFocus={() =>
                setFocusedField(
                  "username"
                )
              }
              onBlur={() =>
                setFocusedField("")
              }
            />

            <ReadOnlyField
              label="Email address"
              value={
                email ||
                "No email found"
              }
              icon="mail-outline"
            />

            <View
              style={
                styles.emailNoteBox
              }
            >
              <View
                style={
                  styles.emailNoteIcon
                }
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color={
                    colors.accent2
                  }
                />
              </View>

              <Text
                style={
                  styles.emailNoteText
                }
              >
                Your email is used for
                sign in and account
                recovery, so it cannot
                be changed here.
              </Text>
            </View>

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

            <AppButton
              title={
                saving
                  ? "Saving..."
                  : "Save Changes"
              }
              icon="save-outline"
              onPress={
                handleSaveProfile
              }
              loading={saving}
              disabled={saving || !hasChanges || !profileLoaded}
              style={[
                styles.saveButton,
                !hasChanges &&
                  styles.saveButtonDisabled,
              ]}
            />

            <TouchableOpacity
              activeOpacity={0.82}
              style={
                styles.cancelButton
              }
              onPress={onBack}
              disabled={saving}
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

          <View
            style={
              styles.securityNote
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={colors.muted2}
            />

            <Text
              style={
                styles.securityNoteText
              }
            >
              Profile changes are saved
              to your CrayThrive account.
            </Text>
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  editable = true,
  focused,
  onFocus,
  onBlur,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.formGroup}>
      <Text
        style={styles.inputLabel}
      >
        {label}
      </Text>

      <View
        style={[
          styles.formInput,
          focused &&
            styles.formInputFocused,
          !editable &&
            styles.formInputDisabled,
        ]}
      >
        <View
          style={styles.inputIcon}
        >
          <Ionicons
            name={icon}
            size={18}
            color={
              focused
                ? colors.accent2
                : colors.muted
            }
          />
        </View>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            colors.muted2
          }
          style={
            styles.formTextInput
          }
          editable={editable}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </View>
    </View>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.formGroup}>
      <Text
        style={styles.inputLabel}
      >
        {label}
      </Text>

      <View
        style={
          styles.readOnlyField
        }
      >
        <View
          style={
            styles.inputIcon
          }
        >
          <Ionicons
            name={icon}
            size={18}
            color={colors.muted}
          />
        </View>

        <Text
          style={
            styles.readOnlyText
          }
          
        >
          {value}
        </Text>

        <Ionicons
          name="lock-closed-outline"
          size={15}
          color={colors.muted2}
        />
      </View>
    </View>
  );
}

async function uriToArrayBuffer(uri) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error(
        "Unable to read selected image."
      );
    }

    return await response.arrayBuffer();
  }

  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.exists && info.size > MAX_IMAGE_BYTES) throw new Error('Please choose a photo smaller than 5 MB.');

  const base64 =
    await FileSystem.readAsStringAsync(
      uri,
      {
        encoding: "base64",
      }
    );

  return base64ToArrayBuffer(base64);
}

function base64ToArrayBuffer(base64) {
  const binaryString = decode(base64);

  const length =
    binaryString.length;

  const bytes =
    new Uint8Array(length);

  for (
    let index = 0;
    index < length;
    index += 1
  ) {
    bytes[index] =
      binaryString.charCodeAt(index);
  }

  return bytes.buffer;
}





function getFriendlyStorageError(
  error
) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  if (
    message.includes("bucket") ||
    message.includes("not found")
  ) {
    return "Profile photo upload failed. Please create a public profile photo storage bucket.";
  }

  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes("policy")
  ) {
    return "Profile photo upload failed because of profile photo storage permission.";
  }

  return error?.message || "";
}

function getFriendlyProfileError(
  error
) {
  const message = String(
    error?.message || ""
  ).toLowerCase();

  if (
    message.includes("username")
  ) {
    return "Profile save failed because the username column is missing or blocked.";
  }

  if (
    message.includes("avatar_url")
  ) {
    return "Profile save failed because the avatar_url column is missing or blocked.";
  }

  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes("policy")
  ) {
    return "Profile save failed because of account permission rules.";
  }

  return (
    error?.message ||
    "Unable to save profile."
  );
}

function randomString() {
  return Math.random()
    .toString(36)
    .slice(2, 10);
}

function makeStyles(colors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 22,
  },

  scroll: {
    paddingTop: 3,
    paddingBottom: 140,
  },

  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  loadingIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      colors.accentSoft,
    borderWidth: 1,
    borderColor:
      colors.accentBorder,
  },

  loadingTitle: {
    marginTop: 13,
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },

  loadingText: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "400",
  },

  profileCard: {
    padding: 16,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOW.soft,
  },

  avatarButton: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor:
      colors.accentSoft,
    borderWidth: 1,
    borderColor:
      colors.accentBorder,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  cameraBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      colors.accent2,
    borderWidth: 2,
    borderColor: colors.deep,
  },

  profileInfo: {
    flex: 1,
    minWidth: 0,
    marginLeft: 14,
  },

  profileName: {
    color: colors.textStrong,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.25,
  },

  profileEmail: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "400",
  },

  photoAction: {
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 9,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor:
      colors.accentSoft,
    borderWidth: 1,
    borderColor:
      colors.accentBorder,
  },

  photoActionText: {
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "600",
  },

  selectedPhotoBox: {
    marginTop: 11,
    padding: 11,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor:
      colors.successSoft,
    borderWidth: 1,
    borderColor:
      "rgba(74,222,128,0.20)",
  },

  selectedPhotoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    backgroundColor:
      "rgba(74,222,128,0.09)",
  },

  selectedPhotoContent: {
    flex: 1,
  },

  selectedPhotoTitle: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
  },

  selectedPhotoText: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  removeButton: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      colors.dangerSoft,
  },

  errorBox: {
    marginTop: 11,
    padding: 12,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor:
      colors.dangerSoft,
    borderWidth: 1,
    borderColor:
      "rgba(248,113,113,0.24)",
  },

  errorIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    backgroundColor:
      "rgba(248,113,113,0.10)",
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },

  errorText: {
    marginTop: 3,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  sectionIntro: {
    marginTop: 23,
    marginBottom: 12,
  },

  sectionTitle: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "700",
  },

  sectionSubtitle: {
    marginTop: 3,
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  formCard: {
    padding: 16,
    borderRadius: 21,
  },

  formGroup: {
    marginBottom: 17,
  },

  inputLabel: {
    marginBottom: 8,
    color:
      colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  formInput: {
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  formInputFocused: {
    backgroundColor:
      "rgba(34,211,197,0.04)",
    borderColor:
      colors.accentBorder,
  },

  formInputDisabled: {
    opacity: 0.65,
  },

  inputIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor:
      colors.accentSoft,
  },

  formTextInput: {
    flex: 1,
    height: 54,
    paddingVertical: 0,
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "500",
  },

  readOnlyField: {
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor:
      colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },

  readOnlyText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "500",
  },

  emailNoteBox: {
    marginTop: -3,
    marginBottom: 18,
    padding: 11,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor:
      colors.accentSoft,
    borderWidth: 1,
    borderColor:
      colors.accentBorder,
  },

  emailNoteIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor:
      colors.surfaceSoft,
  },

  emailNoteText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },

  statusBox: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor:
      colors.accentSoft,
    borderWidth: 1,
    borderColor:
      colors.accentBorder,
  },

  statusText: {
    flex: 1,
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "500",
  },

  saveButton: {
    marginTop: 2,
  },

  saveButtonDisabled: {
    opacity: 0.5,
  },

  cancelButton: {
    minHeight: 44,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },

  securityNote: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  securityNoteText: {
    color: colors.muted2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
});
}
