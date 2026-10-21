import { evaluateMonitoring, monitoringColor, normalizeAmmoniaScan } from '../../utils/sensorMonitoring';
import { fetchServerTime } from '../../utils/serverClock';
import { fetchCurrentUserThresholdSettings } from '../../utils/thresholdSettings';
import { SensorSafeRange } from '../../components/tank/SensorReadingCard';
import useThresholdRefresh from '../../hooks/useThresholdRefresh';
// src/screens/main/AmmoniaReaderScreen.js

import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import AppScreen from "../../components/ui/AppScreen";
import useSingleFlight from '../../hooks/useSingleFlight';
import {
  COLORS,
  RADIUS,
  SHADOW,
} from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";

import {
  analyzeAmmoniaImage,
  classifyManualAmmonia,
} from "../../utils/ammoniaScanner";

import {
  saveAmmoniaReading,
} from "../../utils/ammoniaReadings";

const MODES = [
  {
    key: "camera",
    label: "Camera",
    icon: "camera-outline",
  },
  {
    key: "manual",
    label: "Manual",
    icon: "create-outline",
  },
];

export default function AmmoniaReaderScreen({
  tank,
  onBack,
}) {
  const theme = useAppTheme();

  const colors = useMemo(
    () => ({
      ...COLORS,
      ...(theme?.colors || {}),
    }),
    [theme?.colors]
  );

  const styles = useMemo(
    () =>
      makeStyles(
        colors,
        theme?.isDark ?? true
      ),
    [colors, theme?.isDark]
  );

  const cameraRef = useRef(null);
  const savedResultRef = useRef(null);

  const [
    cameraPermission,
    requestCameraPermission,
  ] = useCameraPermissions();

  const [activeMode, setActiveMode] =
    useState("camera");

  const [cameraVisible, setCameraVisible] =
    useState(true);

  const [cameraReady, setCameraReady] =
    useState(false);

  const [torchEnabled, setTorchEnabled] =
    useState(false);

  const [capturing, setCapturing] =
    useState(false);

  const [analyzing, setAnalyzing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [capturedImage, setCapturedImage] =
    useState(null);

  const [result, setResult] =
    useState(null);

  const [saved, setSaved] =
    useState(false);

  const [manualValue, setManualValue] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [messageType, setMessageType] =
    useState("info");

 const tankId =
    tank?.id ||
    tank?.uuid ||
    tank?.tank_id ||
    null;

  const [thresholds, setThresholds] = useState(null);
  const [savedReading, setSavedReading] = useState(null);
  useThresholdRefresh([tankId], values => {
    if (values[String(tankId)]) setThresholds(values[String(tankId)]);
  });
  useEffect(() => { let active = true; setThresholds(null); setSavedReading(null);
    fetchServerTime().catch(() => null);
    if (tankId) fetchCurrentUserThresholdSettings(tankId).then(value => { if (active) setThresholds(value); })
      .catch(() => { console.log("AMMONIA THRESHOLD ERROR:"); });
    return () => { active = false; };
  }, [result, tankId]);

  const tankName =
    tank?.tank_name ||
    tank?.name ||
    "Selected Tank";

  function showMessage(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  function clearResultState() {
    setResult(null);
    setSaved(false);
    setMessage("");
  }

  function setImageFromAsset(
    asset,
    source
  ) {
    if (!asset?.uri) {
      return;
    }

    setCapturedImage({
      uri: asset.uri,
      width: asset.width || null,
      height: asset.height || null,
      mimeType: asset.mimeType || null,
      source,
    });

    setCameraVisible(false);
    setTorchEnabled(false);
    setCameraReady(false);

    clearResultState();
  }

  async function handleCapture() {
    if (!cameraRef.current) {
      showMessage(
        "error",
        "Camera is not available yet."
      );
      return;
    }

    if (!cameraReady) {
      showMessage(
        "error",
        "Wait for the camera to finish preparing."
      );
      return;
    }

    if (capturing) {
      return;
    }

    setCapturing(true);
    setMessage("");

    try {
      const photo =
        await cameraRef.current.takePictureAsync({
          quality: 0.9,
          skipProcessing: false,
          exif: false,
        });

      if (!photo?.uri) {
        throw new Error(
          "No image was captured."
        );
      }

      setImageFromAsset(
        photo,
        "craythrive-camera"
      );
    } catch (error) {
      console.log("AMMONIA CAMERA CAPTURE ERROR:");

      showMessage(
        "error",
        error?.message ||
          "Unable to capture the image."
      );
    } finally {
      setCapturing(false);
    }
  }

  async function handlePhoneCamera() {
    if (capturing) {
      return;
    }

    setCapturing(true);
    setMessage("");

    /*
      Unmount CameraView first so there is not another
      active preview behind the system camera.
    */
    setCameraVisible(false);
    setTorchEnabled(false);

    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        showMessage(
          "error",
          "Camera permission is required to take a photo."
        );

        setCameraVisible(true);
        return;
      }

      const pickerResult =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.9,
        });

      if (pickerResult.canceled) {
        setCameraVisible(true);
        return;
      }

      const asset =
        pickerResult.assets?.[0];

      if (!asset?.uri) {
        throw new Error(
          "The phone camera did not return an image."
        );
      }

      setImageFromAsset(
        asset,
        "phone-camera"
      );

      showMessage(
        "success",
        "Photo captured. Check the reaction pad before analyzing."
      );
    } catch (error) {
      console.log("PHONE CAMERA ERROR:");

      setCameraVisible(true);

      showMessage(
        "error",
        error?.message ||
          "Unable to open the phone camera."
      );
    } finally {
      setCapturing(false);
    }
  }

  async function handleGallery() {
    if (capturing) {
      return;
    }

    setCapturing(true);
    setMessage("");

    setCameraVisible(false);
    setTorchEnabled(false);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showMessage(
          "error",
          "Photo access is required to choose an image."
        );

        setCameraVisible(true);
        return;
      }

      const pickerResult =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.9,
        });

      if (pickerResult.canceled) {
        setCameraVisible(true);
        return;
      }

      const asset =
        pickerResult.assets?.[0];

      if (!asset?.uri) {
        throw new Error(
          "No photo was selected."
        );
      }

      setImageFromAsset(
        asset,
        "gallery"
      );

      showMessage(
        "success",
        "Photo selected from the gallery. Make sure the reaction pad is centered and clearly visible."
      );
    } catch (error) {
      console.log("AMMONIA GALLERY ERROR:");

      setCameraVisible(true);

      showMessage(
        "error",
        error?.message ||
          "Unable to select a photo."
      );
    } finally {
      setCapturing(false);
    }
  }

  function handleRetake() {
    setCapturedImage(null);
    setResult(null);
    setSaved(false);

    setCameraVisible(true);
    setCameraReady(false);
    setTorchEnabled(false);

    setMessage("");
  }

  async function handleAnalyzeImage() {
    if (!capturedImage?.uri) {
      showMessage(
        "error",
        "Capture or select an image first."
      );
      return;
    }

    if (analyzing) {
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setSaved(false);
    setMessage("");

    try {
      const analysis =
        await analyzeAmmoniaImage(
          capturedImage.uri
        );

      setResult(analysis);

      if (
        !analysis ||
        analysis.status === "INVALID"
      ) {
        showMessage(
          "error",
          analysis?.message ||
            "The image could not be analyzed."
        );

        return;
      }

      if (
        analysis.qualityWarnings?.length
      ) {
        showMessage(
          "warning",
          analysis.qualityWarnings[0]
        );
      } else {
        showMessage(
          "success",
          "Image analysis completed."
        );
      }
    } catch (error) {
      console.log("AMMONIA ANALYSIS ERROR:");

      showMessage(
        "error",
        error?.message ||
          "Failed to analyze the image."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function handleManualValueChange(value) {
    let cleaned = String(
      value || ""
    ).replace(/[^0-9.]/g, "");

    const firstDot =
      cleaned.indexOf(".");

    if (firstDot >= 0) {
      cleaned =
        cleaned.slice(
          0,
          firstDot + 1
        ) +
        cleaned
          .slice(firstDot + 1)
          .replace(/\./g, "");
    }

    setManualValue(cleaned);
    setResult(null);
    setSaved(false);
    setMessage("");
  }

  function handleManualAnalyze() {
    if (
      manualValue === "" ||
      manualValue === "."
    ) {
      showMessage(
        "error",
        "Enter the ammonia value shown by your manual strip comparison."
      );
      return;
    }

    const analysis =
      classifyManualAmmonia(
        manualValue
      );

    setResult(analysis);
    setSaved(false);

    if (
      analysis.status === "INVALID"
    ) {
      showMessage(
        "error",
        analysis.message
      );
      return;
    }

    showMessage(
      "success",
      "Manual ammonia value is ready to save."
    );
  }

  const handleSave = useSingleFlight(async function handleSave() {
    if (!tankId) {
      showMessage(
        "error",
        "No selected tank was found."
      );
      return;
    }

    if (!result) {
      showMessage(
        "error",
        "Analyze the image or enter a manual result first."
      );
      return;
    }

    if (!result.shouldSave) {
      showMessage(
        "error",
        "This result cannot be saved. Capture or enter another result."
      );
      return;
    }

    if (saved || saving || savedResultRef.current === result) {
      return;
    }

    setSaving(true);

    try {
      const savedRow = await saveAmmoniaReading({
        tankId,
        result,
      });

      savedResultRef.current = result;
      setSavedReading(savedRow);
      setSaved(true);

      showMessage(
        "success",
        `Ammonia result saved to ${tankName}.`
      );
    } catch (error) {
      console.log("SAVE AMMONIA ERROR:");

      showMessage(
        "error",
        error?.message ||
          "Failed to save the ammonia result."
      );
    } finally {
      setSaving(false);
    }
  });

  function handleScanAgain() {
    setCapturedImage(null);
    setResult(null);
    setSaved(false);

    setManualValue("");

    setActiveMode("camera");
    setCameraVisible(true);
    setCameraReady(false);
    setTorchEnabled(false);

    setMessage("");
  }

  function handleModeChange(nextMode) {
    setActiveMode(nextMode);
    setMessage("");

    if (nextMode === "manual") {
      setCameraVisible(false);
      setTorchEnabled(false);
      return;
    }

    if (!capturedImage) {
      setCameraVisible(true);
    }
  }

  function renderCamera() {
    if (!cameraPermission) {
      return (
        <View style={styles.cameraState}>
          <ActivityIndicator
            color={colors.accent2}
          />

          <Text
            style={styles.cameraStateText}
          >
            Checking camera permission...
          </Text>
        </View>
      );
    }

    if (
      !cameraPermission.granted
    ) {
      return (
        <View style={styles.permissionCard}>
          <View
            style={styles.permissionIcon}
          >
            <Ionicons
              name="camera-outline"
              size={28}
              color={colors.accent2}
            />
          </View>

          <Text
            style={styles.permissionTitle}
          >
            Camera permission needed
          </Text>

          <Text
            style={styles.permissionText}
          >
            CrayThrive needs camera access
            to scan the ammonia test strip.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.primaryButton}
            onPress={
              requestCameraPermission
            }
          >
            <Ionicons
              name="camera-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.primaryButtonText
              }
            >
              Allow Camera
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (capturedImage?.uri) {
      return renderCapturedImage();
    }

    if (!cameraVisible) {
      return (
        <View style={styles.cameraState}>
          <ActivityIndicator
            color={colors.accent2}
          />

          <Text
            style={styles.cameraStateText}
          >
            Opening image source...
          </Text>
        </View>
      );
    }

    return (
      <>
        <View
          style={styles.cameraContainer}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"

            /*
              Expo FocusMode:
              "off" = automatically focuses when needed.
              This is different from disabling the camera's focus.
            */
            autofocus="off"

            enableTorch={torchEnabled}

            onCameraReady={() => {
              setCameraReady(true);
            }}
          />

          <View
            pointerEvents="none"
            style={styles.cameraShade}
          >
            <View
              style={styles.guideBox}
            >
              <View
                style={[
                  styles.corner,
                  styles.cornerTopLeft,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.cornerTopRight,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.cornerBottomLeft,
                ]}
              />

              <View
                style={[
                  styles.corner,
                  styles.cornerBottomRight,
                ]}
              />

              <View
                style={
                  styles.padTarget
                }
              />

              <Text
                style={styles.guideText}
              >
                Place the reaction pad
                inside the center box
              </Text>
            </View>
          </View>

          <View
            style={styles.cameraTopRow}
          >
            <View
              style={
                styles.autofocusBadge
              }
            >
              <Ionicons
                name="scan-outline"
                size={15}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.cameraBadgeText
                }
              >
                Auto focus
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.cameraRoundButton,
                torchEnabled &&
                  styles.cameraRoundButtonActive,
              ]}
              onPress={() =>
                setTorchEnabled(
                  (current) => !current
                )
              }
            >
              <Ionicons
                name={
                  torchEnabled
                    ? "flash"
                    : "flash-off-outline"
                }
                size={19}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>

          {!cameraReady ? (
            <View
              style={
                styles.cameraLoadingOverlay
              }
            >
              <ActivityIndicator
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.cameraLoadingText
                }
              >
                Preparing camera...
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.focusHint}>
          Hold the phone steady and give the
          camera a moment to focus. If the
          reaction pad is still blurry, use
          Phone Camera below.
        </Text>

        <TouchableOpacity
          activeOpacity={0.88}
          style={[
            styles.captureButton,
            (!cameraReady ||
              capturing) &&
              styles.disabledButton,
          ]}
          disabled={
            !cameraReady ||
            capturing
          }
          onPress={handleCapture}
        >
          {capturing ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <>
              <View
                style={
                  styles.captureCircle
                }
              />

              <Text
                style={
                  styles.captureButtonText
                }
              >
                Capture Strip
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View
          style={styles.sourceRow}
        >
          <SourceButton
            icon="camera-reverse-outline"
            title="Phone Camera"
            subtitle="Use system camera"
            colors={colors}
            styles={styles}
            disabled={capturing}
            onPress={handlePhoneCamera}
          />

          <SourceButton
            icon="images-outline"
            title="Gallery"
            subtitle="Choose a photo"
            colors={colors}
            styles={styles}
            disabled={capturing}
            onPress={handleGallery}
          />
        </View>
      </>
    );
  }

  function renderCapturedImage() {
    return (
      <>
        <View
          style={styles.previewCard}
        >
          <Image
            source={{
              uri: capturedImage.uri,
            }}
            style={styles.previewImage}
            resizeMode="contain"
          />

          <View
            pointerEvents="none"
            style={styles.previewGuide}
          >
            <View
              style={
                styles.previewPadTarget
              }
            />
          </View>

          <View
            style={
              styles.previewSourceBadge
            }
          >
            <Ionicons
              name={
                getSourceIcon(
                  capturedImage.source
                )
              }
              size={14}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.previewSourceText
              }
            >
              {getSourceLabel(
                capturedImage.source
              )}
            </Text>
          </View>
        </View>

        <Text
          style={styles.previewHint}
        >
          Check that the colored reaction
          pad is visible near the center.
          Retake the photo if it is blurry,
          dark, or affected by glare.
        </Text>

        <View
          style={styles.actionRow}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            style={
              styles.secondaryButton
            }
            onPress={handleRetake}
            disabled={analyzing}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color={colors.accent2}
            />

            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Retake
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.primaryButton,
              analyzing &&
                styles.disabledButton,
            ]}
            onPress={
              handleAnalyzeImage
            }
            disabled={analyzing}
          >
            {analyzing ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <>
                <Ionicons
                  name="color-filter-outline"
                  size={18}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Analyze
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View
          style={
            styles.alternateSourceRow
          }
        >
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.textButton}
            onPress={
              handlePhoneCamera
            }
          >
            <Ionicons
              name="camera-outline"
              size={17}
              color={colors.accent2}
            />

            <Text
              style={
                styles.textButtonText
              }
            >
              New phone photo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.textButton}
            onPress={handleGallery}
          >
            <Ionicons
              name="images-outline"
              size={17}
              color={colors.accent2}
            />

            <Text
              style={
                styles.textButtonText
              }
            >
              Choose another
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  function renderManual() {
    return (
      <View style={styles.manualCard}>
        <View
          style={styles.manualHeader}
        >
          <View
            style={styles.manualIcon}
          >
            <Ionicons
              name="create-outline"
              size={22}
              color={colors.accent2}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={styles.manualTitle}
            >
              Manual Input
            </Text>

            <Text
              style={styles.manualText}
            >
              Compare the strip with the
              LIANKAI chart, then enter the
              ammonia value.
            </Text>
          </View>
        </View>

        <Text
          style={styles.inputLabel}
        >
          Ammonia result
        </Text>

        <View
          style={styles.inputWrapper}
        >
          <TextInput
            value={manualValue}
            onChangeText={
              handleManualValueChange
            }
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="Example: 0.5"
            placeholderTextColor={
              colors.muted2
            }
          />

          <View
            style={styles.inputUnit}
          >
            <Text
              style={
                styles.inputUnitText
              }
            >
              ppm
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.primaryButton}
          onPress={
            handleManualAnalyze
          }
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={19}
            color="#FFFFFF"
          />

          <Text
            style={
              styles.primaryButtonText
            }
          >
            Use Manual Result
          </Text>
        </TouchableOpacity>

        <View
          style={styles.manualNote}
        >
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.warning}
          />

          <Text
            style={styles.manualNoteText}
          >
            Manual entry should use the
            value you personally matched
            against the supported test-strip
            chart.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <AppScreen onBack={onBack}>
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.backButton}
            onPress={onBack}
          >
            <Ionicons
              name="chevron-back"
              size={23}
              color={
                colors.textStrong
              }
            />
          </TouchableOpacity>

          <View
            style={styles.headerText}
          >
            <Text
              style={styles.eyebrow}
            >
              Water Quality
            </Text>

            <Text
              style={styles.title}
            >
              Scan Ammonia
            </Text>

            <Text
              style={styles.subtitle}
              numberOfLines={1}
            >
              {tankName}
            </Text>
          </View>

          <View
            style={styles.headerIcon}
          >
            <Ionicons
              name="flask-outline"
              size={24}
              color={colors.accent2}
            />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.scroll
          }
        >
          <View
            style={styles.tankCard}
          >
            <View
              style={styles.tankIcon}
            >
              <Ionicons
                name="water-outline"
                size={22}
                color={colors.accent2}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={styles.tankLabel}
              >
                Saving result to
              </Text>

              <Text
                style={styles.tankName}
              >
                {tankName}
              </Text>
            </View>

            <View
              style={styles.selectedBadge}
            >
              <Ionicons
                name="checkmark"
                size={14}
                color={colors.success}
              />

              <Text
                style={
                  styles.selectedText
                }
              >
                Selected
              </Text>
            </View>
          </View>

          <View
            style={styles.infoCard}
          >
            <Ionicons
              name="scan-outline"
              size={22}
              color={colors.accent2}
            />

            <View style={{ flex: 1 }}>
              <Text
                style={styles.infoTitle}
              >
                LIANKAI test-strip scan
              </Text>

              <Text
                style={styles.infoText}
              >
                Use even lighting, avoid
                glare and shadows, keep the
                test strip flat, and place
                the reaction pad inside the
                center guide.
              </Text>
            </View>
          </View>

          <View
            style={styles.modeTabs}
          >
            {MODES.map((mode) => {
              const active =
                activeMode === mode.key;

              return (
                <TouchableOpacity
                  key={mode.key}
                  activeOpacity={0.85}
                  style={[
                    styles.modeTab,
                    active &&
                      styles.modeTabActive,
                  ]}
                  onPress={() =>
                    handleModeChange(
                      mode.key
                    )
                  }
                >
                  <Ionicons
                    name={mode.icon}
                    size={17}
                    color={
                      active
                        ? colors.accent2
                        : colors.muted
                    }
                  />

                  <Text
                    style={[
                      styles.modeTabText,
                      active &&
                        styles.modeTabTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {message ? (
            <MessageBox
              type={messageType}
              message={message}
              colors={colors}
              styles={styles}
            />
          ) : null}

          {activeMode === "camera"
            ? renderCamera()
            : renderManual()}

          {result ? (
            <ResultCard
              result={result}
              saved={saved}
              savedReading={savedResultRef.current === result && String(savedReading?.tank_id) === String(tankId) ? savedReading : null}
              saving={saving}
              colors={colors}
              styles={styles}
              onSave={handleSave}
              onScanAgain={
                handleScanAgain
              }
              onReturn={onBack}
             thresholds={thresholds} />
          ) : null}

          <View
            style={styles.disclaimerCard}
          >
            <Ionicons
              name="information-circle-outline"
              size={19}
              color={colors.muted}
            />

            <Text
              style={
                styles.disclaimerText
              }
            >
              Smartphone test-strip
              scanning provides an estimated
              field measurement. Lighting,
              camera quality, strip timing,
              and calibration can affect the
              result.
            </Text>
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function SourceButton({
  icon,
  title,
  subtitle,
  disabled,
  onPress,
  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      disabled={disabled}
      style={[
        styles.sourceButton,
        disabled &&
          styles.disabledButton,
      ]}
      onPress={onPress}
    >
      <View
        style={
          styles.sourceButtonIcon
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color={colors.accent2}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={styles.sourceTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.sourceSubtitle}
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={17}
        color={colors.muted2}
      />
    </TouchableOpacity>
  );
}

function ResultCard({thresholds,
  result,
  saved,
  savedReading,
  saving,
  onSave,
  onScanAgain,
  onReturn,
  colors,
  styles,
}) {
  const metric = evaluateMonitoring(result.status === 'INVALID' || !thresholds ? null : savedReading
    ? normalizeAmmoniaScan(savedReading) : { ammonia: result.ammoniaLevel }, thresholds,
  { historical: !savedReading }).metrics.ammonia;

  const toneColor = monitoringColor(savedReading ? metric.tone : 'neutral', colors);

  return (
    <View
      style={styles.resultCard}
    >
      <View
        style={styles.resultHeader}
      >
        <View
          style={[
            styles.resultIcon,
            {
              backgroundColor:
                `${toneColor}18`,
            },
          ]}
        >
          <Ionicons
            name={metric.icon}
            size={27}
            color={toneColor}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={styles.resultEyebrow}
          >
            Ammonia Result
          </Text>

          <Text
            style={[
              styles.resultStatus,
              {
                color: toneColor,
              },
            ]}
          >
            {result.status === 'INVALID' ? 'Invalid Scan' : !thresholds ? 'Waiting' : savedReading ? metric.label : `Unsaved preview · ${metric.label}`}
          </Text>
        </View>
      </View>

      {result.status !== "INVALID" ? (
        <View
          style={styles.resultValueBox}
        >
          <Text
            style={styles.resultLabel}
          >
            Estimated result
          </Text>

          <Text
            style={styles.resultValue}
          >
            {formatAmmoniaValue(
              result.ammoniaLevel
            )}{" "}
            ppm
          </Text>

          <Text
            style={styles.chartMatch}
          >
            Reference:{" "}
            {result.chartLabel ||
              "--"}
          </Text>
        </View>
      ) : null}

      {thresholds ? <SensorSafeRange metric={metric} colors={colors} /> : null}
      <Text
        style={styles.resultMessage}
      >
        {result.status === 'INVALID' ? result.message : savedReading ? `${metric.reason} ${metric.scanTimestampLabel || ''}` : 'Preview only. Save this result to record its database timestamp and evaluate its recency.'}
      </Text>

      {Number.isFinite(
        Number(result.avgR)
      ) &&
      Number.isFinite(
        Number(result.avgG)
      ) &&
      Number.isFinite(
        Number(result.avgB)
      ) ? (
        <View
          style={styles.rgbBox}
        >
          <Ionicons
            name="color-palette-outline"
            size={17}
            color={colors.muted}
          />

          <Text
            style={styles.rgbText}
          >
            Sample RGB:{" "}
            {Math.round(result.avgR)},{" "}
            {Math.round(result.avgG)},{" "}
            {Math.round(result.avgB)}
          </Text>
        </View>
      ) : null}

      {result.qualityWarnings?.map(
        (warning, index) => (
          <View
            key={`warning-${index}`}
            style={styles.warningItem}
          >
            <Ionicons
              name="alert-circle-outline"
              size={17}
              color={colors.warning}
            />

            <Text
              style={
                styles.warningText
              }
            >
              {warning}
            </Text>
          </View>
        )
      )}

      {result.recommendations?.length ? (
        <View
          style={
            styles.recommendationBox
          }
        >
          <Text
            style={
              styles.recommendationTitle
            }
          >
            Recommended actions
          </Text>

          {result.recommendations.map(
            (item, index) => (
              <View
                key={`recommendation-${index}`}
                style={
                  styles.recommendationItem
                }
              >
                <View
                  style={
                    styles.recommendationDot
                  }
                />

                <Text
                  style={
                    styles.recommendationText
                  }
                >
                  {item}
                </Text>
              </View>
            )
          )}
        </View>
      ) : null}

      {result.shouldSave ? (
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.saveButton,
            saved &&
              styles.savedButton,
          ]}
          disabled={
            saving || saved
          }
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <>
              <Ionicons
                name={
                  saved
                    ? "checkmark-circle"
                    : "cloud-upload-outline"
                }
                size={19}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.saveButtonText
                }
              >
                {saved
                  ? "Result Saved"
                  : "Save Result"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      <View
        style={styles.resultBottomRow}
      >
        <TouchableOpacity
          activeOpacity={0.82}
          style={
            styles.bottomGhostButton
          }
          onPress={onScanAgain}
        >
          <Ionicons
            name="refresh-outline"
            size={17}
            color={colors.accent2}
          />

          <Text
            style={
              styles.bottomGhostText
            }
          >
            Scan Again
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.82}
          style={
            styles.bottomGhostButton
          }
          onPress={onReturn}
        >
          <Ionicons
            name="arrow-back-outline"
            size={17}
            color={colors.accent2}
          />

          <Text
            style={
              styles.bottomGhostText
            }
          >
            Return to Tank
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MessageBox({
  type,
  message,
  colors,
  styles,
}) {
  const configuration = {
    success: {
      icon: "checkmark-circle-outline",
      color: colors.success,
    },
    warning: {
      icon: "warning-outline",
      color: colors.warning,
    },
    error: {
      icon: "alert-circle-outline",
      color: colors.danger,
    },
    info: {
      icon: "information-circle-outline",
      color: colors.accent2,
    },
  };

  const selected =
    configuration[type] ||
    configuration.info;

  return (
    <View
      style={[
        styles.messageBox,
        {
          borderColor:
            `${selected.color}55`,
          backgroundColor:
            `${selected.color}12`,
        },
      ]}
    >
      <Ionicons
        name={selected.icon}
        size={19}
        color={selected.color}
      />

      <Text
        style={[
          styles.messageText,
          {
            color:
              selected.color,
          },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

function getSourceLabel(source) {
  if (
    source === "phone-camera"
  ) {
    return "Phone Camera";
  }

  if (source === "gallery") {
    return "Gallery";
  }

  return "CrayThrive Camera";
}

function getSourceIcon(source) {
  if (
    source === "phone-camera"
  ) {
    return "camera-outline";
  }

  if (source === "gallery") {
    return "images-outline";
  }

  return "scan-outline";
}



function formatAmmoniaValue(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return number
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function makeStyles(
  colors,
  isDark
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 20,
    },

    scroll: {
      paddingBottom: 130,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 6,
      paddingBottom: 16,
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },

    headerText: {
      flex: 1,
      minWidth: 0,
    },

    eyebrow: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },

    title: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.6,
    },

    subtitle: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 13,
      fontWeight: "500",
    },

    headerIcon: {
      width: 45,
      height: 45,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    tankCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      padding: 14,
      borderRadius: RADIUS.lg,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      ...SHADOW.card,
    },

    tankIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
    },

    tankLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    tankName: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700",
    },

    selectedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        `${colors.success}15`,
    },

    selectedText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "700",
    },

    infoCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
      padding: 14,
      borderRadius: RADIUS.lg,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      marginBottom: 14,
    },

    infoTitle: {
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700",
    },

    infoText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },

    modeTabs: {
      flexDirection: "row",
      gap: 8,
      padding: 5,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },

    modeTab: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },

    modeTabActive: { minHeight: 44,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    modeTabText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "600",
    },

    modeTabTextActive: {
      color: colors.accent2,
      fontWeight: "700",
    },

    messageBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 12,
    },

    messageText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },

    cameraContainer: {
      height: 420,
      overflow: "hidden",
      borderRadius: 24,
      backgroundColor: "#020617",
      borderWidth: 1,
      borderColor: colors.border,
      position: "relative",
    },

    cameraShade: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },

    guideBox: {
      width: "76%",
      height: "42%",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },

    corner: {
      position: "absolute",
      width: 35,
      height: 35,
      borderColor: "#FFFFFF",
    },

    cornerTopLeft: {
      left: 0,
      top: 0,
      borderLeftWidth: 3,
      borderTopWidth: 3,
      borderTopLeftRadius: 12,
    },

    cornerTopRight: {
      right: 0,
      top: 0,
      borderRightWidth: 3,
      borderTopWidth: 3,
      borderTopRightRadius: 12,
    },

    cornerBottomLeft: {
      left: 0,
      bottom: 0,
      borderLeftWidth: 3,
      borderBottomWidth: 3,
      borderBottomLeftRadius: 12,
    },

    cornerBottomRight: {
      right: 0,
      bottom: 0,
      borderRightWidth: 3,
      borderBottomWidth: 3,
      borderBottomRightRadius: 12,
    },

    padTarget: {
      width: 76,
      height: 76,
      borderRadius: 16,
      borderWidth: 2,
      borderColor:
        colors.accent2,
      backgroundColor:
        "rgba(34,211,197,0.08)",
    },

    guideText: {
      position: "absolute",
      bottom: 18,
      color: "#FFFFFF",
      textAlign: "center",
      fontSize: 12,
      fontWeight: "600",
      paddingHorizontal: 12,
      textShadowColor:
        "rgba(0,0,0,0.65)",
      textShadowRadius: 4,
    },

    cameraTopRow: {
      position: "absolute",
      top: 14,
      left: 14,
      right: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    autofocusBadge: {
      height: 34,
      paddingHorizontal: 11,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        "rgba(2,6,23,0.62)",
    },

    cameraBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
    },

    cameraRoundButton: {
      width: 44,
      height: 44,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "rgba(2,6,23,0.62)",
    },

    cameraRoundButtonActive: { minHeight: 44,
      backgroundColor:
        "rgba(245,158,11,0.78)",
    },

    cameraLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor:
        "rgba(2,6,23,0.28)",
    },

    cameraLoadingText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
    },

    focusHint: {
      marginTop: 10,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    captureButton: {
      minHeight: 52,
      marginTop: 12,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor:
        colors.accent,
    },

    captureCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "#FFFFFF",
      borderWidth: 3,
      borderColor:
        "rgba(255,255,255,0.45)",
    },

    captureButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },

    sourceRow: {
      flexDirection: "row",
      gap: 9,
      marginTop: 10,
    },

    sourceButton: {
      flex: 1,
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 11,
      borderRadius: 17,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },

    sourceButtonIcon: {
      width: 35,
      height: 35,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
    },

    sourceTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "700",
    },

    sourceSubtitle: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    cameraState: {
      height: 260,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },

    cameraStateText: {
      color: colors.muted,
      fontSize: 12,
    },

    permissionCard: {
      padding: 22,
      alignItems: "center",
      borderRadius: 22,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },

    permissionIcon: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
    },

    permissionTitle: {
      marginTop: 13,
      color: colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
    },

    permissionText: {
      marginTop: 6,
      marginBottom: 16,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    previewCard: {
      height: 420,
      borderRadius: 24,
      overflow: "hidden",
      backgroundColor: "#020617",
      borderWidth: 1,
      borderColor: colors.border,
      position: "relative",
    },

    previewImage: {
      width: "100%",
      height: "100%",
    },

    previewGuide: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },

    previewPadTarget: {
      width: 76,
      height: 76,
      borderRadius: 16,
      borderWidth: 2,
      borderColor:
        colors.accent2,
      backgroundColor:
        "rgba(34,211,197,0.05)",
    },

    previewSourceBadge: {
      position: "absolute",
      top: 14,
      left: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      height: 32,
      borderRadius: 999,
      backgroundColor:
        "rgba(2,6,23,0.68)",
    },

    previewSourceText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
    },

    previewHint: {
      marginTop: 10,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    actionRow: {
      flexDirection: "row",
      gap: 9,
      marginTop: 12,
    },

    primaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor:
        colors.accent,
      paddingHorizontal: 14,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },

    secondaryButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      paddingHorizontal: 14,
    },

    secondaryButtonText: {
      color: colors.accent2,
      fontSize: 13,
      fontWeight: "700",
    },

    disabledButton: { minHeight: 44,
      opacity: 0.52,
    },

    alternateSourceRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      gap: 10,
      marginTop: 8,
    },

    textButton: { minHeight: 44,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
    },

    textButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    manualCard: {
      padding: 16,
      borderRadius: 22,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
    },

    manualHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
      marginBottom: 16,
    },

    manualIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        colors.accentSoft,
    },

    manualTitle: {
      color: colors.textStrong,
      fontSize: 15,
      fontWeight: "700",
    },

    manualText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },

    inputLabel: {
      marginBottom: 7,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },

    inputWrapper: {
      height: 53,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 15,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: 12,
    },

    input: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      height: "100%",
      paddingHorizontal: 14,
      color: colors.textStrong,
      fontSize: 16,
      fontWeight: "600",
    },

    inputUnit: {
      height: "100%",
      paddingHorizontal: 15,
      alignItems: "center",
      justifyContent: "center",
      borderLeftWidth: 1,
      borderLeftColor:
        colors.border,
    },

    inputUnitText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "700",
    },

    manualNote: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 13,
      padding: 11,
      borderRadius: 13,
      backgroundColor:
        `${colors.warning}10`,
    },

    manualNoteText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
    },

    resultCard: {
      marginTop: 18,
      padding: 16,
      borderRadius: 22,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor: colors.border,
      ...SHADOW.card,
    },

    resultHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },

    resultIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },

    resultEyebrow: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },

    resultStatus: {
      marginTop: 2,
      fontSize: 18,
      fontWeight: "800",
    },

    resultValueBox: {
      marginTop: 14,
      padding: 14,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
    },

    resultLabel: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    resultValue: {
      marginTop: 3,
      color: colors.textStrong,
      fontSize: 27,
      fontWeight: "800",
      letterSpacing: -0.6,
    },

    chartMatch: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
    },

    resultMessage: {
      marginTop: 13,
      color: colors.textStrong,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "500",
    },

    rgbBox: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },

    rgbText: {
      color: colors.muted,
      fontSize: 12,
    },

    warningItem: {
      marginTop: 9,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      padding: 9,
      borderRadius: 11,
      backgroundColor:
        `${colors.warning}10`,
    },

    warningText: {
      flex: 1,
      color: colors.warning,
      fontSize: 12,
      lineHeight: 16,
    },

    recommendationBox: {
      marginTop: 14,
      padding: 13,
      borderRadius: 15,
      backgroundColor:
        colors.surfaceSoft,
    },

    recommendationTitle: {
      color: colors.textStrong,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 8,
    },

    recommendationItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 5,
    },

    recommendationDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      marginTop: 6,
      backgroundColor:
        colors.accent2,
    },

    recommendationText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },

    saveButton: {
      marginTop: 14,
      minHeight: 49,
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor:
        colors.accent,
    },

    savedButton: { minHeight: 44,
      backgroundColor:
        colors.success,
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },

    resultBottomRow: {
      marginTop: 8,
      flexDirection: "row",
      gap: 7,
    },

    bottomGhostButton: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    bottomGhostText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    disclaimerCard: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 12,
      borderRadius: 14,
      backgroundColor:
        isDark
          ? "rgba(255,255,255,0.025)"
          : "rgba(15,23,42,0.025)",
    },

    disclaimerText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
