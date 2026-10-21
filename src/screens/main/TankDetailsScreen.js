import { formatPhilippineDateTime, parseTimestamp } from '../../utils/philippineTime';
import { fetchServerTime, getServerNow } from '../../utils/serverClock';
import SensorReadingCard, { MonitoringBadge } from '../../components/tank/SensorReadingCard';
import { evaluateMonitoring, combineMonitoringReadings, monitoringColor, fetchLatestMonitoringRows, monitoringRequestVersion } from '../../utils/sensorMonitoring';
// src/screens/main/TankDetailsScreen.js

import { Ionicons } from "@expo/vector-icons";
import { resolveEsp32BaseUrls } from '../../utils/deviceUrls';
import { getDeviceOnlineLabel, isDeviceRecent } from '../../utils/deviceWifi';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppScreen from "../../components/ui/AppScreen";

import {
  COLORS,
  RADIUS,
  SHADOW,
} from "../../constants/theme";

import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";

import {
  analyzeTankReading,
  formatTankPopulation,
} from "../../utils/tankRules";

import {
  DEFAULT_THRESHOLDS,
  fetchCurrentUserThresholdSettings,
  normalizeThresholds,
} from "../../utils/thresholdSettings";

import { syncSensorAlertsForReading, syncAmmoniaAlertsForScan } from "../../utils/sensorAlertRules";
import useSingleFlight from '../../hooks/useSingleFlight';
import useMonitoringSync from '../../hooks/useMonitoringSync';

export default function TankDetailsScreen({
  tank,
  onBack,
  onOpenAmmoniaReader,
  onOpenDeviceWifiSetup,
}) {
  const deviceActionLock = useRef(false);
  const [, setDeviceClockTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDeviceClockTick(value => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const { colors, styles } =
    useThemePack();

  const [
    latestReading,
    setLatestReading,
  ] = useState(
    null
  );

  const [
    latestSensorReading,
    setLatestSensorReading,
  ] = useState(null);

  const [
    latestAmmoniaReading,
    setLatestAmmoniaReading,
  ] = useState(null);

  const [
    thresholds,
    setThresholds,
  ] = useState(
    DEFAULT_THRESHOLDS
  );

  const [
    thresholdSource,
    setThresholdSource,
  ] = useState("default");

  const [devices, setDevices] =
    useState([]);

  const [
    availableDevices,
    setAvailableDevices,
  ] = useState([]);

  const [
    claimingDeviceUid,
    setClaimingDeviceUid,
  ] = useState(null);

  const [
    unpairingDeviceUid,
    setUnpairingDeviceUid,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("error");

  const currentTankId =
    getCurrentTankId(tank);
  const detailsIdentity=useRef(currentTankId),lastMonitoringVersion=useRef(0);
  detailsIdentity.current=currentTankId;
  const [monitoringPaired,setMonitoringPaired]=useState(null);
  const monitoringSync=useMonitoringSync([currentTankId],snapshot=>{
    if(snapshot.version<lastMonitoringVersion.current)return false;
    lastMonitoringVersion.current=snapshot.version;
    const sensor=snapshot.sensors.find(row=>String(row.tank_id)===String(currentTankId))||null,
      scan=snapshot.scans.find(row=>String(row.tank_id)===String(currentTankId))||null;
    setLatestSensorReading(sensor);setLatestAmmoniaReading(scan);setLatestReading(combineMonitoringReadings(sensor,scan));
    setThresholds(snapshot.thresholds[String(currentTankId)]);setThresholdSource('saved');setMonitoringPaired(snapshot.paired.has(String(currentTankId)));
  },()=>{lastMonitoringVersion.current=monitoringRequestVersion();setLatestReading(null);setLatestSensorReading(null);setLatestAmmoniaReading(null);setDevices([]);setMonitoringPaired(false);});
  const refreshMonitoring = monitoringSync.refresh;
  /*
  |--------------------------------------------------------------------------
  | DEVICE STATE
  |--------------------------------------------------------------------------
  |
  | Sensor reading frequency is controlled/change-based.
  | Device WiFi status uses last_seen recency, independently of readings.
  |
  */

  const hasPairedDevice =
    monitoringPaired ?? devices.length > 0;

  const readingCoverage =
    useMemo(() => {
      return getReadingCoverage(
        latestReading
      );
    }, [latestReading]);

  const tankCheck = useMemo(() => analyzeTankReading(latestReading, Boolean(latestReading), thresholds, { paired: hasPairedDevice }), [latestReading, hasPairedDevice, thresholds]);

  

  const setPageMessage = useCallback((type, text) => { setMessageType(type); setMessage(text); }, []);

  function showMessage(
    type,
    text
  ) {
    setPageMessage(
      type,
      text
    );

    if (
      Platform.OS !== "web"
    ) {
      Alert.alert(
        type === "success"
          ? "Success"
          : "Notice",
        text
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | WI-FI
  |--------------------------------------------------------------------------
  */

  async function openDeviceWifiSetup(
    device
  ) {
    if (
      onOpenDeviceWifiSetup
    ) {
      onOpenDeviceWifiSetup(
        device
      );

      return;
    }

    const url =
      getDeviceWifiUrl(
        device
      );

    if (!url) {
      showMessage(
        "error",
        "No local Wi-Fi setup address is available for this ESP32."
      );

      return;
    }

    try {
      await Linking.openURL(url);
    } catch (_error) {
      console.log("OPEN WIFI SETUP ERROR:");

      showMessage(
        "error",
        "Unable to open the ESP32 Wi-Fi setup page. Make sure your phone can reach the device on the local network or setup hotspot."
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOAD TANK
  |--------------------------------------------------------------------------
  */

  const loadTankDetails = useCallback(async function(showInitialLoader = false) {
  const requestedTank=currentTankId,version=monitoringRequestVersion();
  const applicable=()=>detailsIdentity.current===requestedTank && version>=lastMonitoringVersion.current;
  if(!requestedTank){setPageMessage('error','Unable to identify this tank.');setLoading(false);return;}
  if(showInitialLoader)setLoading(true);else setRefreshing(true);
  setMessage('');
  try {
    const {data:userData,error:userError}=await supabase.auth.getUser();
    if(userError || !userData?.user?.id)throw new Error('Account unavailable');
    const userId=userData.user.id;
    const [thresholdData,deviceResult,rows]=await Promise.all([
      fetchCurrentUserThresholdSettings(requestedTank),
      supabase.from('iot_devices').select('*').order('created_at',{ascending:true}),
      fetchLatestMonitoringRows(userId,[requestedTank],{version}),
      fetchServerTime().catch(()=>null),
    ]);
    if(!applicable())return;
    lastMonitoringVersion.current=version;
    const supported=(deviceResult.data||[]).filter(device=>!isCameraDevice(device));
    const paired=supported.filter(device=>String(device.user_id)===String(userId)&&String(device.tank_id)===String(requestedTank)&&device.is_claimed===true);
    setDevices(paired);setMonitoringPaired(paired.length>0);
    setAvailableDevices(supported.filter(device=>isDeviceRecent(device,getServerNow())&&device.is_claimed!==true));
    if(deviceResult.error)setPageMessage('warning','Device information could not be refreshed.');
    const activeThresholds=normalizeThresholds(thresholdData),sensor=rows.sensors[0]||null,scan=rows.scans[0]||null;
    setThresholds(activeThresholds);setThresholdSource('saved');
    setLatestSensorReading(sensor);setLatestAmmoniaReading(scan);setLatestReading(combineMonitoringReadings(sensor,scan));
    void refreshMonitoring();
    // Preserve explicit screen-load reconciliation; live monitoring refresh itself is read-only.
    if(sensor)await syncSensorAlertsForReading({userId,tankId:requestedTank,reading:sensor,thresholds:activeThresholds});
    if(scan)await syncAmmoniaAlertsForScan({userId,tankId:requestedTank,scan,thresholds:activeThresholds});
  } catch {
    if(applicable()){setLatestReading(null);setPageMessage('error','Unable to load current readings or thresholds. Check your connection/sign-in and retry.');}
  } finally {if(detailsIdentity.current===requestedTank){setLoading(false);setRefreshing(false);}}
}, [currentTankId, setPageMessage, refreshMonitoring]);
  useEffect(() => {
    lastMonitoringVersion.current=0;setLatestReading(null);setLatestSensorReading(null);setLatestAmmoniaReading(null);setDevices([]);setMonitoringPaired(null);
    void loadTankDetails(true);
    return()=>{if(detailsIdentity.current===currentTankId)detailsIdentity.current=null;};
  }, [loadTankDetails,currentTankId]);

  /*
  |--------------------------------------------------------------------------
  | CLAIM DEVICE
  |--------------------------------------------------------------------------
  */

  const claimDevice = useSingleFlight(async function claimDevice(
    device
  ) {
    if (deviceActionLock.current) return;

    if (
      !device?.device_uid ||
      !currentTankId
    ) {
      showMessage(
        "error",
        "Invalid device or tank selected."
      );

      return;
    }

    if (
      isCameraDevice(device)
    ) {
      showMessage(
        "error",
        "Camera nodes are no longer used by CrayThrive."
      );

      return;
    }

        deviceActionLock.current = true;
setClaimingDeviceUid(
      device.device_uid
    );

    setMessage("");

    try {
      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !userData?.user?.id
      ) {
        showMessage(
          "error",
          "Unable to identify your account. Please sign in again."
        );

        return;
      }

      const userId =
        userData.user.id;

      const {
        data,
        error,
      } = await supabase
        .from("iot_devices")
        .update({
          user_id: userId,

          tank_id:
            currentTankId,

          is_claimed: true,
        })
        .eq(
          "device_uid",
          device.device_uid
        )
        .select("*")
        .maybeSingle();

      if (error) {
        console.log("CLAIM DEVICE ERROR:");

        showMessage(
          "error",
          "Unable to connect this device."
        );

        return;
      }

      if (!data) {
        showMessage(
          "error",
          "Device not found. Make sure the ESP32 is registered and available."
        );

        return;
      }

      showMessage(
        "success",
        `${getDeviceLabel(
          device
        )} connected to this tank.`
      );

      await loadTankDetails(
        false
      );
    } catch (_error) {
      console.log("CLAIM DEVICE CATCH ERROR:");

      showMessage(
        "error",
        "Something went wrong while connecting the device."
      );
    } finally {
      deviceActionLock.current = false;
      setClaimingDeviceUid(
        null
      );
    }
  });

  /*
  |--------------------------------------------------------------------------
  | UNPAIR DEVICE
  |--------------------------------------------------------------------------
  */

  async function unpairDevice(
    device
  ) {
    if (
      !device?.device_uid
    ) {
      showMessage(
        "error",
        "Invalid device selected."
      );

      return;
    }

    const runUnpair =
      async () => {
        if (deviceActionLock.current) return;
        deviceActionLock.current = true;

        setUnpairingDeviceUid(
          device.device_uid
        );

        setMessage("");

        try {
          const {
            data,
            error,
          } = await supabase
            .from(
              "iot_devices"
            )
            .update({
              user_id: null,
              tank_id: null,
              is_claimed: false,
            })
            .eq(
              "device_uid",
              device.device_uid
            )
            .select("*")
            .maybeSingle();

          if (error) {
            console.log("UNPAIR DEVICE ERROR:");

            showMessage(
              "error",
              "Unable to unpair this device."
            );

            return;
          }

          if (!data) {
            showMessage(
              "error",
              "Device not found."
            );

            return;
          }

          showMessage(
            "success",
            `${getDeviceLabel(
              device
            )} unpaired from this tank. Its WiFi settings were kept.`
          );

          await loadTankDetails(
            false
          );
        } catch (_error) {
          console.log("UNPAIR DEVICE CATCH ERROR:");

          showMessage(
            "error",
            "Something went wrong while unpairing the device."
          );
        } finally {
          deviceActionLock.current = false;
          setUnpairingDeviceUid(
            null
          );
        }
      };

    if (
      Platform.OS === "web"
    ) {
      const confirmed =
        typeof window !==
        "undefined"
          ? window.confirm(
              `Unpair ${getDeviceLabel(
                device
              )} from this tank? This removes the device from this tank. It does not erase the ESP32 WiFi settings.`
            )
          : false;

      if (confirmed) {
        runUnpair();
      }

      return;
    }

    Alert.alert(
      "Unpair device",
      `Unpair ${getDeviceLabel(
        device
      )} from this tank? This removes the device from this tank. It does not erase the ESP32 WiFi settings.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Unpair",
          style: "destructive",
          onPress:
            runUnpair,
        },
      ]
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NO TANK
  |--------------------------------------------------------------------------
  */

  if (!tank) {
    return (
      <AppScreen onBack={onBack}>
        <View style={styles.root}>
        {monitoringSync.error ? <Text accessibilityRole="alert" style={{color:colors.muted,fontSize:12,lineHeight:18}}>{monitoringSync.error}</Text> : null}
          <View
            style={styles.centerBox}
          >
            <View
              style={
                styles.centerIcon
              }
            >
              <Ionicons
                name="alert-circle-outline"
                size={31}
                color={
                  colors.warning
                }
              />
            </View>

            <Text
              style={
                styles.centerTitle
              }
            >
              No tank selected
            </Text>

            <Text
              style={
                styles.centerText
              }
            >
              Return to My Tanks and
              choose a tank to view its
              details.
            </Text>

            <TouchableOpacity
              activeOpacity={0.86}
              style={
                styles.primaryButton
              }
              onPress={onBack}
            >
              <Ionicons
                name="chevron-back"
                size={17}
                color="#062C2B"
              />

              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Back to Tanks
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppScreen>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | MAIN
  |--------------------------------------------------------------------------
  */

  return (
    <AppScreen onBack={onBack}>
      <View style={styles.root}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.backButton}
            onPress={onBack}
          >
            <Ionicons
              name="chevron-back"
              size={21}
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
              Tank Details
            </Text>

            <Text
              style={styles.title}
              
            >
              {tank.tank_name ||
                "Tank"}
            </Text>

            <Text
              style={styles.subtitle}
              
            >
              {formatTankType(
                tank.tank_type
              )}
              {" • "}
              {formatTankPopulation(
                tank
              )}
            </Text>
          </View>

          <View
            style={styles.headerIcon}
          >
            <CrayfishIcon
              size={29}
              color={
                colors.accent2
              }
            />
          </View>
        </View>

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
              type={messageType}
              message={message}
              colors={colors}
              styles={styles}
            />
          ) : null}

          {/* CONDITION */}
          <View
            style={styles.statusCard}
          >
            <View
              style={styles.statusTop}
            >
              <View
                style={styles.flexOne}
              >
                <Text
                  style={
                    styles.cardLabel
                  }
                >
                  Tank check
                </Text>

                <Text
                  style={
                    styles.statusTitle
                  }
                >
                  {tankCheck.title ||
                    "Tank condition"}
                </Text>
              </View>

              <StatusBadge
                label={
                  tankCheck.status
                }
                type={
                  tankCheck.type
                }
                colors={colors}
                styles={styles}
              />
            </View>

            <Text
              style={
                styles.statusText
              }
            >
              {tankCheck.message}
            </Text>

            <View
              style={
                styles.suggestionBox
              }
            >
              <View
                style={[styles.scoreCircle, { borderColor: monitoringColor(tankCheck.type, colors), backgroundColor: colors.surfaceSoft }]}
              >
                <Text
                  style={
                    styles.scoreText
                  }
                >
                  {tankCheck.score ===
                    null ||
                  tankCheck.score ===
                    undefined
                    ? "—"
                    : `${tankCheck.score}%`}
                </Text>

                <Text
                  style={
                    styles.scoreLabel
                  }
                >
                  score
                </Text>
              </View>

              <View
                style={styles.flexOne}
              >
                <Text
                  style={
                    styles.suggestionLabel
                  }
                >
                  Suggested action
                </Text>

                <Text
                  style={
                    styles.suggestionText
                  }
                >
                  {
                    tankCheck.suggestion
                  }
                </Text>
              </View>
            </View>

            <View
              style={
                styles.statusMetaGrid
              }
            >
              <StatusMeta
                icon="time-outline"
                label="Latest water reading"
                value={formatRelativeTime(
                  latestReading?.created_at
                )}
                colors={colors}
                styles={styles}
              />

              <StatusMeta
                icon="analytics-outline"
                label="Coverage"
                value={`${readingCoverage.available}/${readingCoverage.total} values`}
                colors={colors}
                styles={styles}
              />

              <StatusMeta
                icon="options-outline"
                label="Thresholds"
                value={
                  thresholdSource ===
                  "saved"
                    ? "Saved settings"
                    : "Default ranges"
                }
                colors={colors}
                styles={styles}
              />

              <StatusMeta
                icon="hardware-chip-outline"
                label="Devices"
                value={
                  devices.length > 0
                    ? `${devices.length} paired`
                    : "None paired"
                }
                colors={colors}
                styles={styles}
              />
            </View>
          </View>

          {/* READINGS */}
          <SectionTitle
            title="Latest Readings"
            action={
              loading
                ? "Loading..."
                : getReadingSourceLabel(
                    latestSensorReading,
                    latestAmmoniaReading
                  )
            }
            styles={styles}
          />

          {loading ? (
            <View
              style={
                styles.loadingBox
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
                Loading tank data
              </Text>

              <Text
                style={
                  styles.loadingText
                }
              >
                Getting the latest saved
                sensor and ammonia
                records.
              </Text>
            </View>
          ) : (
            <View
              style={
                styles.metricGrid
              }
            >
              <SensorReadingCard metric={evaluateMonitoring(latestReading, thresholds, { paired: hasPairedDevice }).metrics.temperature} colors={colors} />

              <SensorReadingCard metric={evaluateMonitoring(latestReading, thresholds, { paired: hasPairedDevice }).metrics.water} colors={colors} />

              <SensorReadingCard metric={evaluateMonitoring(latestReading, thresholds, { paired: hasPairedDevice }).metrics.turbidity} colors={colors} />

              <SensorReadingCard metric={evaluateMonitoring(latestReading, thresholds, { paired: hasPairedDevice }).metrics.ph} colors={colors} />

              <SensorReadingCard metric={evaluateMonitoring(latestReading, thresholds, { paired: hasPairedDevice }).metrics.ammonia} colors={colors} />

              <MetricItem
                icon="time-outline"
                label="Last Water Reading"
                value={formatShortDateTime(
                  latestReading?.created_at
                )}
                status={
                  latestSensorReading
                    ? "Saved record"
                    : "No data"
                }
                colors={colors}
                styles={styles}
              />
            </View>
          )}

          {latestAmmoniaReading ? (
            <View
              style={
                styles.ammoniaInfo
              }
            >
              <View
                style={
                  styles.ammoniaInfoIcon
                }
              >
                <Ionicons
                  name={
                    latestAmmoniaReading.source ===
                    "manual"
                      ? "create-outline"
                      : "flask-outline"
                  }
                  size={18}
                  color={
                    colors.accent2
                  }
                />
              </View>

              <View
                style={styles.flexOne}
              >
                <Text
                  style={
                    styles.ammoniaInfoTitle
                  }
                >
                  Latest ammonia check
                </Text>

                <Text
                  style={
                    styles.ammoniaInfoText
                  }
                >
                  Source: {latestAmmoniaReading.ammonia_source || 'Saved test / scan'}. Saved{" "}
                  {formatDateTime(
                    latestAmmoniaReading.created_at
                  )}
                  . Ammonia checks use
                  the phone camera or
                  manual result entry.
                </Text>
              </View>
            </View>
          ) : null}

          {/* ACTIONS */}
          <SectionTitle
            title="Tank Actions"
            styles={styles}
          />

          <View
            style={
              styles.actionGrid
            }
          >
            <ActionButton
              icon="camera-outline"
              title="Check Ammonia"
              text="Scan a test strip or enter a result manually."
              onPress={() =>
                onOpenAmmoniaReader?.(
                  tank
                )
              }
              colors={colors}
              styles={styles}
            />

            <ActionButton
              icon="refresh-outline"
              title="Refresh Data"
              text="Check for the latest saved tank information."
              loading={
                refreshing
              }
              onPress={() =>
                loadTankDetails(
                  false
                )
              }
              colors={colors}
              styles={styles}
            />
          </View>

          {/* PAIRED DEVICES */}
          <SectionTitle
            title="Paired Devices"
            action={`${devices.length} ${
              devices.length === 1
                ? "device"
                : "devices"
            }`}
            styles={styles}
          />

          {devices.length === 0 ? (
            <EmptyCard
              icon="link-outline"
              title="No ESP32 paired"
              text="Pair a sensor node or actuator node when the hardware is ready. Ammonia testing does not require an ESP32 camera."
              warning
              colors={colors}
              styles={styles}
            />
          ) : (
            <View
              style={styles.list}
            >
              {devices.map(
                (device) => (
                  <DeviceCard
                    key={
                      device.device_uid ||
                      device.id
                    }
                    device={device}
                    unpairing={
                      unpairingDeviceUid ===
                      device.device_uid
                    }
                    onConfigure={() =>
                      openDeviceWifiSetup(
                        device
                      )
                    }
                    onUnpair={() =>
                      unpairDevice(
                        device
                      )
                    }
                    colors={colors}
                    styles={styles}
                  />
                )
              )}
            </View>
          )}

          {/* AVAILABLE DEVICES */}
          <SectionTitle
            title="Available Devices"
            action={`${availableDevices.length} available`}
            styles={styles}
          />

          {availableDevices.length ===
          0 ? (
            <EmptyCard
              icon="search-outline"
              title="No available ESP32 found"
              text="Unclaimed sensor or actuator devices with an online connection status will appear here."
              colors={colors}
              styles={styles}
            />
          ) : (
            <View
              style={styles.list}
            >
              {availableDevices.map(
                (device) => (
                  <AvailableDeviceCard
                    key={
                      device.device_uid ||
                      device.id
                    }
                    device={device}
                    loading={
                      claimingDeviceUid ===
                      device.device_uid
                    }
                    onConnect={() =>
                      claimDevice(
                        device
                      )
                    }
                    colors={colors}
                    styles={styles}
                  />
                )
              )}
            </View>
          )}

          <View
            style={styles.footerNote}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={
                colors.muted2
              }
            />

            <Text
              style={
                styles.footerNoteText
              }
            >
              Sensor readings are saved
              using the system&apos;s
              controlled logging rules,
              so a missing new row does
              not by itself mean that a
              paired ESP32 is offline.
            </Text>
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

/*
|--------------------------------------------------------------------------
| SECTION
|--------------------------------------------------------------------------
*/

function SectionTitle({
  title,
  action,
  styles,
}) {
  return (
    <View
      style={styles.sectionRow}
    >
      <Text
        style={styles.sectionTitle}
      >
        {title}
      </Text>

      {action ? (
        <Text
          style={
            styles.sectionAction
          }
        >
          {action}
        </Text>
      ) : null}
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

function StatusBadge({ label, tone, type, colors }) { return <MonitoringBadge result={{ label, tone: tone || type }} colors={colors} />; }

function StatusMeta({
  icon,
  label,
  value,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.statusMeta}
    >
      <View
        style={
          styles.statusMetaIcon
        }
      >
        <Ionicons
          name={icon}
          size={14}
          color={colors.accent2}
        />
      </View>

      <View
        style={styles.flexOne}
      >
        <Text
          style={
            styles.statusMetaLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.statusMetaValue
          }
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| METRIC
|--------------------------------------------------------------------------
*/

function MetricItem({
  icon,
  label,
  value,
  status,
  helperText,
  colors,
  styles,
}) {
  const tone =
    getStatusTone(status);

  return (
    <View
      style={styles.metricCard}
    >
      <View
        style={styles.metricTop}
      >
        <View
          style={styles.metricIcon}
        >
          <Ionicons
            name={icon}
            size={18}
            color={colors.accent2}
          />
        </View>

        <View
          style={[
            styles.metricDot,

            tone === "success" && {
              backgroundColor:
                colors.success,
            },

            tone === "warning" && {
              backgroundColor:
                colors.warning,
            },

            tone === "danger" && {
              backgroundColor:
                colors.danger,
            },

            tone === "neutral" && {
              backgroundColor:
                colors.muted2,
            },
          ]}
        />
      </View>

      <Text
        style={styles.metricLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.metricValue}
        numberOfLines={2}
      >
        {value || "—"}
      </Text>

      <Text
        style={[
          styles.metricStatus,

          tone === "success" && {
            color:
              colors.success,
          },

          tone === "warning" && {
            color:
              colors.warning,
          },

          tone === "danger" && {
            color:
              colors.danger,
          },

          tone === "neutral" && {
            color:
              colors.muted2,
          },
        ]}
        numberOfLines={2}
      >
        {status || "No data"}
      </Text>

      {helperText ? (
        <Text
          style={
            styles.metricHelper
          }
          numberOfLines={1}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| ACTION
|--------------------------------------------------------------------------
*/

function ActionButton({
  icon,
  title,
  text,
  onPress,
  loading,
  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.actionButton}
      onPress={onPress}
      disabled={loading}
    >
      <View
        style={styles.actionTop}
      >
        <View
          style={styles.actionIcon}
        >
          {loading ? (
            <ActivityIndicator
              color={
                colors.accent2
              }
            />
          ) : (
            <Ionicons
              name={icon}
              size={20}
              color={
                colors.accent2
              }
            />
          )}
        </View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.muted2}
        />
      </View>

      <Text
        style={styles.actionTitle}
      >
        {loading
          ? "Refreshing..."
          : title}
      </Text>

      <Text
        style={styles.actionText}
      >
        {text}
      </Text>
    </TouchableOpacity>
  );
}

/*
|--------------------------------------------------------------------------
| DEVICE
|--------------------------------------------------------------------------
*/

function DeviceCard({
  device,
  onConfigure,
  onUnpair,
  unpairing,
  colors,
  styles,
}) {
  const status = getDeviceOnlineLabel(device, getServerNow());
  const statusTone = status === 'Online' ? 'success' : 'neutral';

  return (
    <View
      style={styles.listCard}
    >
      <View
        style={styles.listIcon}
      >
        <Ionicons
          name={getDeviceIcon(
            device
          )}
          size={21}
          color={colors.accent2}
        />
      </View>

      <View
        style={styles.listContent}
      >
        <View
          style={styles.deviceTitleRow}
        >
          <Text
            style={styles.listTitle}
            numberOfLines={1}
          >
            {getDeviceLabel(
              device
            )}
          </Text>

          <MiniStatus
            label={status}
            tone={statusTone}
            colors={colors}
            styles={styles}
          />
        </View>

        <Text selectable
          style={styles.deviceUid}
          
        >
          {device.device_uid ||
            device.device_name ||
            device.name ||
            "ESP32 device"}
        </Text>

        <View
          style={styles.deviceMeta}
        >
          <DeviceMetaItem
            icon="wifi-outline"
            text={
              device.local_ip ||
              "No local IP"
            }
            colors={colors}
            styles={styles}
          />

          <DeviceMetaItem
            icon="key-outline"
            text={
              device.pairing_code ||
              "No pairing code"
            }
            colors={colors}
            styles={styles}
          />
        </View>

        <View
          style={
            styles.deviceButtons
          }
        >
          <TouchableOpacity
            activeOpacity={0.86}
            style={
              styles.configureButton
            }
            onPress={onConfigure}
            disabled={
              unpairing
            }
          >
            <Ionicons
              name="wifi-outline"
              size={14}
              color={
                colors.accent2
              }
            />

            <Text
              style={
                styles.configureButtonText
              }
            >
              Wi-Fi Setup
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.86}
            style={
              styles.unpairButton
            }
            onPress={
              onUnpair
            }
            disabled={
              unpairing
            }
          >
            {unpairing ? (
              <ActivityIndicator
                size="small"
                color={
                  colors.danger
                }
              />
            ) : (
              <Ionicons
                name="unlink-outline"
                size={14}
                color={
                  colors.danger
                }
              />
            )}

            <Text
              style={
                styles.unpairButtonText
              }
            >
              {unpairing
                ? "Unpairing"
                : "Unpair"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function AvailableDeviceCard({
  device,
  onConnect,
  loading,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.listCard}
    >
      <View
        style={styles.listIcon}
      >
        <Ionicons
          name={getDeviceIcon(
            device
          )}
          size={21}
          color={colors.accent2}
        />
      </View>

      <View
        style={styles.listContent}
      >
        <View
          style={styles.deviceTitleRow}
        >
          <Text
            style={styles.listTitle}
            numberOfLines={1}
          >
            {getDeviceLabel(
              device
            )}
          </Text>

          <MiniStatus
            label={getDeviceOnlineLabel(device, getServerNow())}
            tone={isDeviceRecent(device, getServerNow()) ? 'success' : 'neutral'}
            colors={colors}
            styles={styles}
          />
        </View>

        <Text selectable
          style={styles.deviceUid}
          
        >
          {device.device_uid ||
            device.device_name ||
            "ESP32 device"}
        </Text>

        <View
          style={styles.deviceMeta}
        >
          <DeviceMetaItem
            icon="key-outline"
            text={
              device.pairing_code ||
              "No pairing code"
            }
            colors={colors}
            styles={styles}
          />

          <DeviceMetaItem
            icon="wifi-outline"
            text={
              device.local_ip ||
              "No local IP"
            }
            colors={colors}
            styles={styles}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={
            styles.connectButton
          }
          onPress={onConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color="#062C2B"
            />
          ) : (
            <Ionicons
              name="link-outline"
              size={15}
              color="#062C2B"
            />
          )}

          <Text
            style={
              styles.connectButtonText
            }
          >
            {loading
              ? "Connecting..."
              : "Connect to Tank"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DeviceMetaItem({
  icon,
  text,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.deviceMetaItem}
    >
      <Ionicons
        name={icon}
        size={12}
        color={colors.muted2}
      />

      <Text
        style={styles.deviceMetaText}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function MiniStatus({
  label,
  tone,
  colors,
  styles,
}) {
  return (
    <View
      style={[
        styles.miniStatus,

        tone === "success"
          ? styles.miniStatusSuccess
          : styles.miniStatusNeutral,
      ]}
    >
      <View
        style={[
          styles.miniStatusDot,

          {
            backgroundColor:
              tone === "success"
                ? colors.success
                : colors.muted2,
          },
        ]}
      />

      <Text
        style={[
          styles.miniStatusText,

          {
            color:
              tone === "success"
                ? colors.success
                : colors.muted,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| EMPTY
|--------------------------------------------------------------------------
*/

function EmptyCard({
  icon,
  title,
  text,
  warning = false,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.emptyCard}
    >
      <View
        style={[
          styles.emptyIcon,

          warning &&
            styles.emptyIconWarning,
        ]}
      >
        <Ionicons
          name={icon}
          size={23}
          color={
            warning
              ? colors.warning
              : colors.accent2
          }
        />
      </View>

      <Text
        style={styles.emptyTitle}
      >
        {title}
      </Text>

      <Text
        style={styles.emptyText}
      >
        {text}
      </Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| MESSAGE
|--------------------------------------------------------------------------
*/

function MessageBox({
  type,
  message,
  colors,
  styles,
}) {
  const success =
    type === "success";

  const warning =
    type === "warning";

  const toneColor = success
    ? colors.success
    : warning
    ? colors.warning
    : colors.danger;

  return (
    <View
      style={[
        styles.messageBox,

        success &&
          styles.messageSuccess,

        warning &&
          styles.messageWarning,

        !success &&
          !warning &&
          styles.messageError,
      ]}
    >
      <Ionicons
        name={
          success
            ? "checkmark-circle-outline"
            : warning
            ? "warning-outline"
            : "alert-circle-outline"
        }
        size={18}
        color={toneColor}
      />

      <Text
        style={[
          styles.messageText,
          {
            color:
              toneColor,
          },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| DATA NORMALIZATION
|--------------------------------------------------------------------------
*/





/*
|--------------------------------------------------------------------------
| DEVICE HELPERS
|--------------------------------------------------------------------------
*/

function getCurrentTankId(tank) {
  return (
    tank?.id ||
    tank?.uuid ||
    tank?.tank_id ||
    null
  );
}

function isCameraDevice(device) {
  const type =
    String(
      device?.device_type || ""
    ).toLowerCase();

  const uid =
    String(
      device?.device_uid || ""
    ).toLowerCase();

  return (
    type.includes("camera") ||
    type.includes("cam") ||
    uid.includes("camera") ||
    uid.includes("esp32-cam")
  );
}

function getDeviceIcon(device) {
  const type =
    String(
      device?.device_type || ""
    ).toLowerCase();

  if (
    type.includes(
      "actuator"
    ) ||
    type.includes("pump") ||
    type.includes("relay") ||
    type.includes("feeder")
  ) {
    return "flash-outline";
  }

  return "hardware-chip-outline";
}

function getDeviceLabel(device) {
  const type =
    String(
      device?.device_type || ""
    ).toLowerCase();

  if (
    type.includes(
      "actuator"
    ) ||
    type.includes("pump") ||
    type.includes("relay") ||
    type.includes("feeder")
  ) {
    return "Actuator Node";
  }

  if (
    type.includes("sensor") ||
    type.includes("monitor")
  ) {
    return "Sensor Node";
  }

  return "ESP32 Device";
}

function getDeviceWifiUrl(device) {
  return resolveEsp32BaseUrls(device)[0] + '/wifi';
}

/*
|--------------------------------------------------------------------------
| DISPLAY HELPERS
|--------------------------------------------------------------------------
*/

function getReadingCoverage(
  reading
) {
  const values = [
    reading?.temperature,
    reading?.ph,
    reading?.turbidity,
    reading?.water_level,
    reading?.ammonia,
  ];

  return {
    available:
      values.filter(
        hasValue
      ).length,

    total: values.length,
  };
}

function hasValue(value) {
  return !(
    value === null ||
    value === undefined ||
    value === ""
  );
}

function getReadingSourceLabel(
  sensor,
  ammonia
) {
  if (sensor && ammonia) {
    return "Water + manual scan";
  }

  if (sensor) {
    return "Sensor reading";
  }

  if (ammonia) {
    return "Ammonia check";
  }

  return "No saved data";
}

function getStatusTone(status) { return status === 'Normal' ? 'success' : status === 'Warning' ? 'warning' : status === 'Critical' ? 'danger' : 'neutral'; }



function prettifyText(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}



function formatTankType(value) {
  if (!value) {
    return "Crayfish tank";
  }

  return prettifyText(value);
}

function formatDateTime(value) {
  return formatPhilippineDateTime(value, {}, 'No saved record');
}

function formatShortDateTime(
  value
) {
  return formatPhilippineDateTime(value, { year: undefined });
}

function formatRelativeTime(
  value
) {
  if (!value) return 'No reading';
 const date = parseTimestamp(value), now = getServerNow();
 if (!date) return 'Timestamp unavailable';
 if (!now || now < date) return formatShortDateTime(value);
 const minutes = Math.floor((now - date) / 60000);
 if (minutes < 1) return 'Just now';
 if (minutes < 60) return minutes + 'm ago';
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return hours + 'h ago';
 const days = Math.floor(hours / 24);
 return days < 7 ? days + 'd ago' : formatShortDateTime(value);
}



/*
|--------------------------------------------------------------------------
| THEME
|--------------------------------------------------------------------------
*/

function useThemePack() {
  const theme =
    useAppTheme();

  const isDark =
    theme?.isDark ?? true;

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
    useMemo(
      () =>
        makeStyles(colors),
      [colors]
    );

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

    success:
      sourceColors.success ||
      COLORS.success,

    warning:
      sourceColors.warning ||
      COLORS.warning,

    danger:
      sourceColors.danger ||
      COLORS.danger,

    successSoft:
      sourceColors.successSoft ||
      COLORS.successSoft,

    warningSoft:
      sourceColors.warningSoft ||
      COLORS.warningSoft,

    dangerSoft:
      sourceColors.dangerSoft ||
      COLORS.dangerSoft,
  };
}

/*
|--------------------------------------------------------------------------
| STYLES
|--------------------------------------------------------------------------
*/

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 22,
    },

    flexOne: {
      flex: 1,
      minWidth: 0,
    },

    scroll: {
      paddingTop: 2,
      paddingBottom: 140,
    },

    /*
    |--------------------------------------------------------------------------
    | HEADER
    |--------------------------------------------------------------------------
    */

    header: {
      paddingTop: 8,
      paddingBottom: 17,
      flexDirection: "row",
      alignItems: "center",
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      marginRight: 10,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    headerText: {
      flex: 1,
      minWidth: 0,
    },

    eyebrow: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },

    title: {
      marginTop: 2,
      color:
        colors.textStrong,
      fontSize: 22,
      lineHeight: 29,
      fontWeight: "700",
      letterSpacing: -0.4,
    },

    subtitle: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    headerIcon: {
      width: 46,
      height: 46,
      borderRadius: 15,
      marginLeft: 10,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    /*
    |--------------------------------------------------------------------------
    | MESSAGE
    |--------------------------------------------------------------------------
    */

    messageBox: {
      marginBottom: 11,
      borderRadius: 14,
      paddingHorizontal: 11,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
    },

    messageError: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.22)",
    },

    messageWarning: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.22)",
    },

    messageSuccess: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.22)",
    },

    messageText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    statusCard: {
      borderRadius: 21,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      padding: 15,
      ...SHADOW.soft,
    },

    statusTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },

    cardLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },

    statusTitle: {
      marginTop: 5,
      color:
        colors.textStrong,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "700",
    },

    statusText: {
      marginTop: 8,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    badge: {
      minHeight: 26,
      paddingHorizontal: 8,
      borderRadius:
        RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
    },

    badgeDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    badgeText: {
      fontSize: 12,
      fontWeight: "600",
    },

    badgeSafe: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.20)",
    },

    badgeWarning: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.20)",
    },

    badgeDanger: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.20)",
    },

    badgeNeutral: {
      backgroundColor:
        colors.surfaceSoft,
      borderColor:
        colors.border,
    },

    suggestionBox: {
      marginTop: 13,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 11,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    scoreCircle: {
      width: 57,
      height: 57,
      borderRadius: 18,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    scoreText: {
      color:
        colors.textStrong,
      fontSize: 15,
      fontWeight: "700",
    },

    scoreLabel: {
      marginTop: 1,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
      textTransform: "uppercase",
    },

    suggestionLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    suggestionText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    statusMetaGrid: {
      marginTop: 12,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },

    statusMeta: {
      width: "48%",
      minHeight: 48,
      borderRadius: 13,
      padding: 8,
      backgroundColor:
        colors.surfaceSoft,
      flexDirection: "row",
      alignItems: "center",
    },

    statusMetaIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      marginRight: 7,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    statusMetaLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    statusMetaValue: {
      marginTop: 1,
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    /*
    |--------------------------------------------------------------------------
    | SECTION
    |--------------------------------------------------------------------------
    */

    sectionRow: {
      marginTop: 23,
      marginBottom: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 10,
    },

    sectionTitle: {
      color:
        colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
    },

    sectionAction: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | LOADING
    |--------------------------------------------------------------------------
    */

    loadingBox: {
      minHeight: 180,
      borderRadius: 19,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 20,
      alignItems: "center",
      justifyContent: "center",
    },

    loadingIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    loadingTitle: {
      marginTop: 10,
      color:
        colors.textStrong,
      fontSize: 13,
      fontWeight: "700",
    },

    loadingText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    /*
    |--------------------------------------------------------------------------
    | METRICS
    |--------------------------------------------------------------------------
    */

    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    metricCard: {
      width: "48%",
      minHeight: 132,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 13,
    },

    metricTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginBottom: 9,
    },

    metricIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    metricDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        colors.muted2,
    },

    metricLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    metricValue: {
      marginTop: 4,
      color:
        colors.textStrong,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "700",
    },

    metricStatus: {
      marginTop: 4,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
    },

    metricHelper: {
      marginTop: 3,
      color: colors.accent2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | AMMONIA INFO
    |--------------------------------------------------------------------------
    */

    ammoniaInfo: {
      marginTop: 10,
      padding: 10,
      borderRadius: 14,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      flexDirection: "row",
      alignItems: "center",
    },

    ammoniaInfoIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        colors.surfaceSoft,
      marginRight: 9,
      alignItems: "center",
      justifyContent: "center",
    },

    ammoniaInfoTitle: {
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    ammoniaInfoText: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | ACTIONS
    |--------------------------------------------------------------------------
    */

    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    actionButton: {
      width: "48%",
      minHeight: 116,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 12,
    },

    actionTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    actionIcon: {
      width: 39,
      height: 39,
      borderRadius: 13,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    actionTitle: {
      marginTop: 10,
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "700",
    },

    actionText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | DEVICE CARDS
    |--------------------------------------------------------------------------
    */

    list: {
      gap: 9,
    },

    listCard: {
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 12,
      flexDirection: "row",
      alignItems: "flex-start",
    },

    listIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },

    listContent: {
      flex: 1,
      minWidth: 0,
    },

    deviceTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },

    listTitle: {
      flex: 1,
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "700",
    },

    deviceUid: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    deviceMeta: {
      marginTop: 7,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },

    deviceMetaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },

    deviceMetaText: {
      maxWidth: 145,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    deviceButtons: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },

    configureButton: {
      minHeight: 44,
      borderRadius: 11,
      paddingHorizontal: 10,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    configureButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    unpairButton: {
      minHeight: 44,
      borderRadius: 11,
      paddingHorizontal: 10,
      backgroundColor:
        colors.dangerSoft,
      borderWidth: 1,
      borderColor:
        "rgba(248,113,113,0.22)",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    unpairButtonText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "600",
    },

    connectButton: {
      marginTop: 10,
      minHeight: 44,
      borderRadius: 12,
      paddingHorizontal: 11,
      alignSelf: "flex-start",
      backgroundColor:
        colors.accent,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },

    connectButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "600",
    },

    miniStatus: {
      minHeight: 22,
      paddingHorizontal: 6,
      borderRadius:
        RADIUS.pill,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },

    miniStatusSuccess: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.20)",
    },

    miniStatusNeutral: {
      backgroundColor:
        colors.surfaceSoft,
      borderColor:
        colors.border,
    },

    miniStatusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    miniStatusText: {
      fontSize: 12,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | EMPTY
    |--------------------------------------------------------------------------
    */

    emptyCard: {
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 17,
      alignItems: "center",
    },

    emptyIcon: {
      width: 49,
      height: 49,
      borderRadius: 16,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    emptyIconWarning: {
      backgroundColor:
        colors.warningSoft,
    },

    emptyTitle: {
      marginTop: 9,
      color:
        colors.textStrong,
      fontSize: 12.5,
      fontWeight: "700",
      textAlign: "center",
    },

    emptyText: {
      marginTop: 4,
      maxWidth: 300,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    /*
    |--------------------------------------------------------------------------
    | FOOTER
    |--------------------------------------------------------------------------
    */

    footerNote: {
      marginTop: 19,
      paddingHorizontal: 4,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
    },

    footerNoteText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | NO TANK
    |--------------------------------------------------------------------------
    */

    centerBox: {
      flex: 1,
      padding: 22,
      alignItems: "center",
      justifyContent: "center",
    },

    centerIcon: {
      width: 64,
      height: 64,
      borderRadius: 21,
      backgroundColor:
        colors.warningSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    centerTitle: {
      marginTop: 12,
      color:
        colors.textStrong,
      fontSize: 15,
      fontWeight: "700",
    },

    centerText: {
      marginTop: 5,
      maxWidth: 270,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    primaryButton: {
      marginTop: 17,
      minHeight: 44,
      paddingHorizontal: 15,
      borderRadius: 13,
      backgroundColor:
        colors.accent,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 5,
    },

    primaryButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "600",
    },
  });
}
