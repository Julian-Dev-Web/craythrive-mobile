import { ActivityEntry } from '../../components/tank/TankActivityTimeline';
import { normalizeActivityEvent } from '../../utils/activityHistory';
import { formatPhilippineDateTime, formatPhilippineDate, formatPhilippineAlertMessage, manilaDateKey, shiftManilaDate, manilaDayRange, manilaReportRange } from '../../utils/philippineTime';
import { fetchServerTime, getServerNow } from '../../utils/serverClock';
import { DEFAULT_THRESHOLDS, fetchTankThresholdSettings } from '../../utils/thresholdSettings';
import SensorReadingCard, { MonitoringBadge } from '../../components/tank/SensorReadingCard';
import { evaluateMonitoring, normalizeSensorReading, combineMonitoringReadings, buildMonitoringHistory, fetchPairedTankIds, monitoringColor, fetchLatestMonitoringRows , mergeMonitoringTank, monitoringRequestVersion, fetchMonitoringRows, newestMonitoringRow } from '../../utils/sensorMonitoring';
// src/screens/main/ReportsScreen.js

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import CrayfishIcon from "../../components/icons/CrayfishIcon";
import AppCard from "../../components/ui/AppCard";
import AppHeader from "../../components/ui/AppHeader";
import AppScreen from "../../components/ui/AppScreen";
import SectionHeader from "../../components/ui/SectionHeader";

import {
  COLORS,
  RADIUS,
  SHADOW,
} from "../../constants/theme";

import { useAppTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import useSingleFlight from '../../hooks/useSingleFlight';
import useMonitoringSync from '../../hooks/useMonitoringSync';
import { formatPumpAlert } from '../../utils/pumpActionWording';

const WEB_REPORTS_URL =
  "https://www.craythrive.site/login";

const REPORT_DAYS = 7;

export default function ReportsScreen() {
  const { colors, styles } =
    useThemePack();

  const [tanks, setTanks] =
    useState([]);
  const loadGuard=useRef({active:true,generation:0});
  const monitoringSync = useMonitoringSync(tanks.map(tank=>tank.id),snapshot=>{
    setTanks(current=>current.map(tank=>{
      const id=String(tank.id),sensor=snapshot.sensors.find(row=>String(row.tank_id)===id)||null,scan=snapshot.scans.find(row=>String(row.tank_id)===id)||null;
      if(String(tank.user_id)!==String(snapshot.userId))return tank;
      return mergeMonitoringTank(tank,{...tank,latest_sensor:sensor,latest_ammonia:scan,latest_reading:combineMonitoringReadings(sensor,scan),
        monitoring_thresholds:snapshot.thresholds[id],has_paired_device:snapshot.paired.has(id),monitoring_version:snapshot.version,
        weekly_scores:buildWeeklyScores(tank.sensor_readings||[],snapshot.thresholds[id],snapshot.serverTime)});
    }));
  },()=>{loadGuard.current.generation++;setTanks([]);});
  const [
    selectedTankId,
    setSelectedTankId,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  

  const selectedTank =
    useMemo(() => {
      if (!selectedTankId) {
        return null;
      }

      return (
        tanks.find(
          (tank) =>
            String(tank.id) ===
            String(selectedTankId)
        ) || null
      );
    }, [
      selectedTankId,
      tanks,
    ]);

  const overview = useMemo(() => {
    const totalTanks =
      tanks.length;

    const tanksWithData =
      tanks.filter(
        (tank) =>
          evaluateMonitoring(tank.latest_reading, tank.monitoring_thresholds).availableMetrics > 0
      );

    const scores =
      tanksWithData
        .map((tank) => {
          const result =
            analyzeReportReading(
              tank.latest_reading, tank.monitoring_thresholds, tank.has_paired_device
            );

          return result.score;
        })
        .filter(
          Number.isFinite
        );

    /*
     * Do NOT count no-data tanks as 0%.
     * That would make the average look worse
     * even though no condition was actually measured.
     */
    const averageCondition =
      scores.length > 0
        ? Math.round(
            scores.reduce(
              (sum, score) =>
                sum + score,
              0
            ) / scores.length
          )
        : null;

    const alertCount =
      tanks.reduce(
        (sum, tank) =>
          sum +
          Number(
            tank.alerts?.length ||
              0
          ),
        0
      );

    const unreadAlerts =
      tanks.reduce(
        (sum, tank) =>
          sum +
          Number(
            (
              tank.alerts || []
            ).filter(
              (alert) =>
                !alert.is_read
            ).length
          ),
        0
      );

    const controlLogs =
      tanks.reduce(
        (sum, tank) =>
          sum +
          Number(
            tank.control_logs
              ?.length || 0
          ),
        0
      );

    return {
      totalTanks,

      withData:
        tanksWithData.length,

      averageCondition,

      alertCount,

      unreadAlerts,

      controlLogs,
    };
  }, [tanks]);

  const loadReports = useSingleFlight(useCallback(async function(showLoader = false) {
  const monitoringVersion=monitoringRequestVersion();
  const loadGeneration=loadGuard.current.generation;
  if (showLoader) {
    setLoading(true);
  }
  setMessage("");
  try {
    const {
      data: userData,
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      setMessage("Unable to load your account. Please sign in again.");
      setTanks([]);
      return;
    }
    const userId = userData.user.id;
    const serverTime = await fetchServerTime();
    const reportRange = manilaReportRange(serverTime, REPORT_DAYS);
    const {
      data: tankData,
      error: tankError
    } = await supabase.from("tanks").select("*").eq("user_id", userId).order("created_at", {
      ascending: false
    });
    if (tankError) {
      console.log("REPORTS LOAD TANKS ERROR:");
      setMessage("Failed to load tanks.");
      return;
    }
    const tankList = tankData || [];
    const tankIds = tankList.map(tank => tank.id).filter(Boolean);
    const thresholdsByTank = await fetchTankThresholdSettings(userId, tankIds);
    const pairedIds = await fetchPairedTankIds(userId, tankIds);
 const latestRows = await fetchLatestMonitoringRows(userId, tankIds, {version:monitoringVersion});
    let sensorRows = [];
    let ammoniaRows = [];
    let controlRows = [];
    let alertRows = [];
    if (tankIds.length > 0) {
      const historyRows=await fetchMonitoringRows(userId,tankIds,{start:reportRange.start,end:reportRange.end,sensorLimit:1000,scanLimit:1000});
      sensorRows=historyRows.sensors;ammoniaRows=historyRows.scans;
      const {
        data: controlData,
        error: controlError
      } = await supabase.from("control_logs").select("*").eq("user_id", userId).in("tank_id", tankIds).gte("created_at", reportRange.start).lt("created_at", reportRange.end).order("created_at", {
        ascending: false
      });
      if (controlError) {
        console.log("REPORTS CONTROL ERROR:");
      } else {
        controlRows = controlData || [];
      }
      const {
        data: alertsData,
        error: alertsError
      } = await supabase.from("alerts").select("*").in("tank_id", tankIds).gte("created_at", reportRange.start).lt("created_at", reportRange.end).order("created_at", {
        ascending: false
      });
      if (alertsError) {
        console.log("REPORTS ALERTS ERROR:");
      } else {
        alertRows = alertsData || [];
      }
    }
    const mappedTanks = tankList.map(tank => {
      const activeThresholds = thresholdsByTank[String(tank.id)];
      const sensors = sensorRows.filter(row => row.tank_id === tank.id);
      const ammonia = ammoniaRows.filter(row => row.tank_id === tank.id);
      const controls = controlRows.filter(row => row.tank_id === tank.id);
      const alerts = alertRows.filter(row => row.tank_id === tank.id);
      const latestSensor = latestRows.sensors.find(row => row.tank_id === tank.id) || null;
      const latestAmmonia = latestRows.scans.find(row => row.tank_id === tank.id) || null;
      const latestReading = buildCombinedReading(latestSensor, latestAmmonia);
      return {
        ...tank,
        monitoring_version:monitoringVersion,
        monitoring_thresholds: activeThresholds,
        has_paired_device: pairedIds.has(String(tank.id)),
        sensor_readings: sensors,
        ammonia_readings: ammonia,
        control_logs: controls,
        alerts,
        latest_sensor: latestSensor,
        latest_ammonia: latestAmmonia,
        latest_reading: latestReading,
        reading_history: buildMonitoringHistory(sensors, ammonia),
        weekly_scores: buildWeeklyScores(sensors, activeThresholds, serverTime)
      };
    });
    if(!loadGuard.current.active || loadGeneration!==loadGuard.current.generation)return;
    setTanks(current=>mappedTanks.map(tank=>{
      const merged=mergeMonitoringTank(current.find(item=>String(item.id)===String(tank.id)),tank);
      return {...merged,weekly_scores:buildWeeklyScores(merged.sensor_readings,merged.monitoring_thresholds,serverTime)};
    }));
    setSelectedTankId(current => mappedTanks.some(tank => String(tank.id) === String(current)) ? current : null);
  } catch (_error) {
    console.log("REPORTS LOAD CATCH:");
    setMessage("Something went wrong while loading reports.");
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []));
  useEffect(()=>{const guard=loadGuard.current;guard.active=true;void loadReports(true);return()=>{guard.active=false;guard.generation++;};},[loadReports]);

  async function handleRefresh() {
    setRefreshing(true);

    await loadReports(false);
  }

  async function openWebReports() {
    try {
      const supported =
        await Linking.canOpenURL(
          WEB_REPORTS_URL
        );

      if (!supported) {
        showNotice(
          "Unable to open web dashboard",
          "Please open CrayThrive Web from your browser."
        );

        return;
      }

      await Linking.openURL(
        WEB_REPORTS_URL
      );
    } catch (_error) {
      console.log("OPEN WEB REPORTS ERROR:");

      showNotice(
        "Unable to open web dashboard",
        "Please try again."
      );
    }
  }

  function showNotice(
    title,
    text
  ) {
    if (
      Platform.OS === "web"
    ) {
      if (
        typeof window !==
        "undefined"
      ) {
        window.alert(
          `${title}\n\n${text}`
        );
      }

      return;
    }

    Alert.alert(
      title,
      text
    );
  }

  return (
    <AppScreen onBack={selectedTankId ? () => setSelectedTankId(null) : undefined}>
      <View style={styles.root}>
        {monitoringSync.error ? <Text accessibilityRole="alert" style={{color:colors.muted,fontSize:12,lineHeight:18}}>{monitoringSync.error}</Text> : null}
        <AppHeader
          eyebrow="Monitoring"
          title="Reports"
          subtitle="Review the last 7 days of tank readings, alerts, and control activity."
          icon="bar-chart-outline"
          rightAction="refresh-outline"
          onRightPress={() =>
            loadReports(true)
          }
        />

        <ScrollView
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
          {selectedTank ? (
            <TankReportDetails
              tank={
                selectedTank
              }
              onBack={() =>
                setSelectedTankId(
                  null
                )
              }
              colors={colors}
              styles={styles}
            />
          ) : (
            <>
              <OverviewSection
                loading={loading}
                message={message}
                overview={overview}
                onRetry={() =>
                  loadReports(true)
                }
                colors={colors}
                styles={styles}
              />

              <WebReportCard
                onPress={
                  openWebReports
                }
                colors={colors}
                styles={styles}
              />

              <SectionHeader
                title="Tank Reports"
                action={`${tanks.length} ${
                  tanks.length === 1
                    ? "tank"
                    : "tanks"
                }`}
              />

              {loading ? (
                <StateCard
                  loading
                  title="Loading reports"
                  text="Getting the latest 7-day tank records."
                  colors={colors}
                  styles={styles}
                />
              ) : message ? (
                <StateCard
                  icon="alert-circle-outline"
                  iconColor={
                    colors.warning
                  }
                  title="Reports unavailable"
                  text={message}
                  action="Try Again"
                  onPress={() =>
                    loadReports(true)
                  }
                  colors={colors}
                  styles={styles}
                />
              ) : tanks.length ===
                0 ? (
                <StateCard
                  customIcon={
                    <CrayfishIcon
                      size={40}
                      color={
                        colors.accent2
                      }
                    />
                  }
                  title="No tanks yet"
                  text="Add a tank first. Reports will appear after readings or tank activity are saved."
                  colors={colors}
                  styles={styles}
                />
              ) : (
                <View
                  style={
                    styles.tankList
                  }
                >
                  {tanks.map(
                    (tank) => (
                      <TankReportCard
                        key={
                          tank.id
                        }
                        tank={tank}
                        onPress={() =>
                          setSelectedTankId(
                            tank.id
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
            </>
          )}
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function OverviewSection({
  loading,
  message,
  overview,
  onRetry,
  colors,
  styles,
}) {
  if (loading) {
    return (
      <AppCard
        strong
        style={
          styles.overviewHero
        }
      >
        <View
          style={
            styles.overviewIcon
          }
        >
          <ActivityIndicator
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
              styles.overviewTitle
            }
          >
            Preparing reports
          </Text>

          <Text
            style={
              styles.overviewText
            }
          >
            Loading your recent tank
            records.
          </Text>
        </View>
      </AppCard>
    );
  }

  if (message) {
    return (
      <AppCard
        strong
        style={
          styles.overviewHero
        }
      >
        <View
          style={
            styles.overviewWarningIcon
          }
        >
          <Ionicons
            name="alert-circle-outline"
            size={25}
            color={colors.warning}
          />
        </View>

        <View
          style={styles.flexOne}
        >
          <Text
            style={
              styles.overviewTitle
            }
          >
            Report summary unavailable
          </Text>

          <Text
            style={
              styles.overviewText
            }
          >
            {message}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={
            styles.smallButton
          }
          onPress={onRetry}
        >
          <Text
            style={
              styles.smallButtonText
            }
          >
            Retry
          </Text>
        </TouchableOpacity>
      </AppCard>
    );
  }

  return (
    <View>
      <AppCard
        strong
        style={
          styles.overviewHero
        }
      >
        <View
          style={
            styles.overviewIcon
          }
        >
          <Ionicons
            name="analytics-outline"
            size={26}
            color={colors.accent2}
          />
        </View>

        <View
          style={styles.flexOne}
        >
          <Text
            style={
              styles.overviewTitle
            }
          >
            7-Day Summary
          </Text>

          <Text
            style={
              styles.overviewText
            }
          >
            Recent readings, ammonia
            checks, alerts, and control
            records across your tanks.
          </Text>
        </View>
      </AppCard>

      <View
        style={
          styles.overviewGrid
        }
      >
        <OverviewCard
          icon="water-outline"
          label="Tanks"
          value={
            overview.totalTanks
          }
          note={`${overview.withData} with recent data`}
          colors={colors}
          styles={styles}
        />

        <OverviewCard
          icon="pulse-outline"
          label="Avg. Condition"
          value={
            overview.averageCondition ===
            null
              ? "—"
              : `${overview.averageCondition}%`
          }
          note={
            overview.averageCondition ===
            null
              ? "No recent reading"
              : "Available readings only"
          }
          colors={colors}
          styles={styles}
        />

        <OverviewCard
          icon="notifications-outline"
          label="Alerts"
          value={
            overview.alertCount
          }
          note={`${overview.unreadAlerts} unread`}
          colors={colors}
          styles={styles}
        />

        <OverviewCard
          icon="options-outline"
          label="Actions"
          value={
            overview.controlLogs
          }
          note="Last 7 days"
          colors={colors}
          styles={styles}
        />
      </View>
    </View>
  );
}

function WebReportCard({
  onPress,
  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
    >
      <AppCard
        strong
        style={styles.webCard}
      >
        <View
          style={styles.webIcon}
        >
          <Ionicons
            name="desktop-outline"
            size={23}
            color={colors.accent2}
          />
        </View>

        <View
          style={styles.flexOne}
        >
          <Text
            style={styles.webTitle}
          >
            Open Web Dashboard
          </Text>

          <Text
            style={styles.webText}
          >
            Use CrayThrive Web for a
            larger reporting view and
            deeper record review.
          </Text>
        </View>

        <View
          style={styles.webArrow}
        >
          <Ionicons
            name="open-outline"
            size={17}
            color={colors.accent2}
          />
        </View>
      </AppCard>
    </TouchableOpacity>
  );
}

function TankReportCard({
  tank,
  onPress,
  colors,
  styles,
}) {
  const result =
    analyzeReportReading(
      tank.latest_reading, tank.monitoring_thresholds, tank.has_paired_device
    );

  const latest =
    tank.latest_reading;

  const alertCount =
    tank.alerts?.length || 0;

  const latestDate =
    latest?.created_at || null;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
    >
      <AppCard
        strong
        style={styles.tankCard}
      >
        <View
          style={
            styles.tankTopRow
          }
        >
          <View
            style={styles.tankIcon}
          >
            <CrayfishIcon
              size={30}
              color={
                colors.accent2
              }
            />
          </View>

          <View
            style={styles.flexOne}
          >
            <View
              style={
                styles.tankTitleRow
              }
            >
              <Text
                style={styles.tankTitle}
                numberOfLines={1}
              >
                {tank.tank_name ||
                  "Tank"}
              </Text>

              <StatusBadge
                label={
                  result.status
                }
                tone={
                  result.type
                }
                styles={styles}
               colors={colors} />
            </View>

            <Text
              style={
                styles.tankSubtitle
              }
              numberOfLines={1}
            >
              {formatType(
                tank.tank_type ||
                  "Crayfish tank"
              )}
              {" • "}
              {formatPopulation(
                tank
              )}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.tankMetricsRow
          }
        >
          <SmallMetric
            label="Condition"
            value={
              result.score !== null
                ? `${result.score}%`
                : "—"
            }
            styles={styles}
          />

          <SmallMetric
            label="Alerts"
            value={alertCount}
            styles={styles}
          />

          <SmallMetric
            label="Water reading"
            value={
              formatShortDate(
                latestDate
              )
            }
            styles={styles}
          />
        </View>

        <View
          style={
            styles.coverageRow
          }
        >
          <Ionicons
            name="layers-outline"
            size={14}
            color={colors.muted2}
          />

          <Text
            style={
              styles.coverageText
            }
          >
            {result.availableMetrics} of{" "}
            {result.totalMetrics} monitored
            values available for current display
          </Text>
        </View>

        <View
          style={
            styles.tankFooter
          }
        >
          <Text
            style={
              styles.tankFooterText
            }
          >
            {latest
              ? result.message
              : "No saved reading was found for this tank during the current 7-day report period."}
          </Text>

          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.muted2}
          />
        </View>
      </AppCard>
    </TouchableOpacity>
  );
}

function TankReportDetails({
  tank,
  onBack,
  colors,
  styles,
}) {
  const latest =
    tank.latest_reading;

  const result =
    analyzeReportReading(latest, tank.monitoring_thresholds, tank.has_paired_device);

  return (
    <View>
      <View
        style={styles.detailHeader}
      >
        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.backButton}
          onPress={onBack}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={
              colors.textStrong
            }
          />
        </TouchableOpacity>

        <View
          style={styles.flexOne}
        >
          <Text
            style={styles.detailTitle}
            
          >
            {tank.tank_name ||
              "Tank Report"}
          </Text>

          <Text
            style={
              styles.detailSubtitle
            }
          >
            Last 7 days • Per-tank report
          </Text>
        </View>
      </View>

      <AppCard
        strong
        style={styles.detailHero}
      >
        <View
          style={styles.flexOne}
        >
          <View
            style={
              styles.detailHeroTop
            }
          >
            <Text
              style={styles.cardLabel}
            >
              Condition score
            </Text>

            <StatusBadge
              label={
                result.status
              }
              tone={
                result.type
              }
              styles={styles}
             colors={colors} />
          </View>

          <Text
            style={
              styles.healthScore
            }
          >
            {result.score !== null
              ? `${result.score}%`
              : "—"}
          </Text>

          <Text
            style={
              styles.detailHeroText
            }
          >
            {result.message}
          </Text>

          <Text
            style={
              styles.detailHeroSuggestion
            }
          >
            {result.suggestion}
          </Text>

          <View
            style={
              styles.metricCoverage
            }
          >
            <Ionicons
              name="analytics-outline"
              size={14}
              color={colors.accent2}
            />

            <Text
              style={
                styles.metricCoverageText
              }
            >
              {result.availableMetrics} of{" "}
              {result.totalMetrics} latest
              monitored values available
            </Text>
          </View>
        </View>

        <View
          style={
            styles.detailHeroIcon
          }
        >
          <Ionicons
            name={
              result.icon ||
              "analytics-outline"
            }
            size={26}
            color={getResultColor(
              result.type,
              colors
            )}
          />
        </View>
      </AppCard>

      <SectionHeader
        title="Latest Saved Readings"
        action={getSourceLabel(
          tank
        )}
      />

      <View
        style={styles.sensorGrid}
      >
        <SensorReadingCard metric={evaluateMonitoring(latest, tank.monitoring_thresholds, { paired: tank.has_paired_device }).metrics.temperature} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(latest, tank.monitoring_thresholds, { paired: tank.has_paired_device }).metrics.ph} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(latest, tank.monitoring_thresholds, { paired: tank.has_paired_device }).metrics.turbidity} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(latest, tank.monitoring_thresholds, { paired: tank.has_paired_device }).metrics.ammonia} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(latest, tank.monitoring_thresholds, { paired: tank.has_paired_device }).metrics.water} colors={colors} />

        <SensorCard
          icon="time-outline"
          label="Last Water Reading"
          value={formatDateTimeCompact(
            latest?.created_at
          )}
          state={latest?.sensor_created_at ? 'Saved record' : 'No data'}
          colors={colors}
          styles={styles}
        />
      </View>

      <SectionHeader
        title="7-Day Water Sensor Trend"
      />

      <WeeklyChart
        scores={
          tank.weekly_scores || []
        }
        colors={colors}
        styles={styles}
      />

      <SectionHeader title="Reading History" action="Last 7 days" />
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
        Water readings and manual ammonia scans are separate events. Showing the latest 20 events.
      </Text>
      {(tank.reading_history || []).slice(0, 20).map((event, index) => (
        <ReadingHistoryEvent key={`${event.type}-${event.reading.id || event.timestamp}-${index}`} event={event}
          thresholds={tank.monitoring_thresholds} colors={colors} />
      ))}
      {!tank.reading_history?.length ? <EmptyMini text="No readings were saved during the last 7 days." colors={colors} styles={styles} /> : null}

      <SectionHeader
        title="Recent Alerts"
        action={`${tank.alerts?.length || 0} ${
          tank.alerts?.length === 1
            ? "alert"
            : "alerts"
        }`}
      />

      {tank.alerts?.length >
      0 ? (
        <View
          style={styles.listStack}
        >
          {tank.alerts
            .slice(0, 8)
            .map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                colors={colors}
                styles={styles}
              />
            ))}
        </View>
      ) : (
        <EmptyMini
          text="No alerts were recorded for this tank during the last 7 days."
          colors={colors}
          styles={styles}
        />
      )}

      <SectionHeader
        title="Control Activity"
        action={`${tank.control_logs?.length || 0} ${
          tank.control_logs?.length === 1
            ? "record"
            : "records"
        }`}
      />

      {tank.control_logs
        ?.length > 0 ? (
        <View
          style={styles.listStack}
        >
          {tank.control_logs
            .slice(0, 8)
            .map((log) => (
              <ControlLogRow
                key={log.id}
                log={log}
                tank={tank}
                colors={colors}
                styles={styles}
              />
            ))}
        </View>
      ) : (
        <EmptyMini
          text="No feeder or water-control activity was recorded for this tank during the last 7 days."
          colors={colors}
          styles={styles}
        />
      )}
    </View>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  note,
  colors,
  styles,
}) {
  return (
    <AppCard
      strong
      style={
        styles.overviewCard
      }
    >
      <View
        style={
          styles.overviewSmallIcon
        }
      >
        <Ionicons
          name={icon}
          size={18}
          color={colors.accent2}
        />
      </View>

      <Text
        style={styles.overviewValue}
      >
        {value}
      </Text>

      <Text
        style={styles.overviewLabel}
      >
        {label}
      </Text>

      {note ? (
        <Text
          style={styles.overviewNote}
        >
          {note}
        </Text>
      ) : null}
    </AppCard>
  );
}

function SmallMetric({
  label,
  value,
  styles,
}) {
  return (
    <View
      style={styles.smallMetric}
    >
      <Text
        style={
          styles.smallMetricValue
        }
        numberOfLines={1}
      >
        {value}
      </Text>

      <Text
        style={
          styles.smallMetricLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function SensorCard({
  icon,
  label,
  value,
  state,
  material = false,
  colors,
  styles,
}) {
  const Icon = material
    ? MaterialCommunityIcons
    : Ionicons;

  const stateType =
    getStateType(state);

  return (
    <View
      style={styles.sensorCard}
    >
      <View
        style={styles.sensorTop}
      >
        <View
          style={styles.sensorIcon}
        >
          <Icon
            name={icon}
            size={18}
            color={colors.accent2}
          />
        </View>

        <View
          style={[
            styles.sensorDot,

            stateType ===
              "warning" &&
              styles.sensorDotWarning,

            stateType ===
              "danger" &&
              styles.sensorDotDanger,

            stateType ===
              "neutral" &&
              styles.sensorDotNeutral,
          ]}
        />
      </View>

      <Text
        style={styles.sensorLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.sensorValue}
        numberOfLines={2}
      >
        {formatMetricText(
          value
        )}
      </Text>

      <Text
        style={[
          styles.sensorState,

          stateType ===
            "warning" &&
            styles.sensorStateWarning,

          stateType ===
            "danger" &&
            styles.sensorStateDanger,

          stateType ===
            "neutral" &&
            styles.sensorStateNeutral,
        ]}
        numberOfLines={2}
      >
        {prettifyStatus(state)}
      </Text>
    </View>
  );
}

function WeeklyChart({
  scores,
  colors,
  styles,
}) {
  const hasScores =
    scores.some(
      (item) =>
        item.hasData
    );

  if (!hasScores) {
    return (
      <EmptyMini
        text="Not enough saved readings are available to build a 7-day condition trend."
        colors={colors}
        styles={styles}
      />
    );
  }

  return (
    <AppCard
      strong
      style={styles.chartCard}
    >
      <View
        style={styles.chartLegend}
      >
        <View
          style={
            styles.chartLegendDot
          }
        />

        <Text
          style={
            styles.chartLegendText
          }
        >
          Daily score uses the latest water sensor reading saved that day.
          Manual ammonia scans appear separately in Reading History.
        </Text>
      </View>

      <View
        style={styles.chartBars}
      >
        {scores.map((item) => {
          const height =
            item.hasData
              ? Math.max(
                  10,
                  Math.min(
                    110,
                    item.score * 1.1
                  )
                )
              : 4;

          return (
            <View
              key={item.dayKey}
              style={styles.chartItem}
            >
              <View
                style={styles.barTrack}
              >
                <View
                  style={[
                    styles.barFill,

                    !item.hasData &&
                      styles.barFillEmpty,

                    {
                      height,
                    },
                  , { backgroundColor: monitoringColor(item.tone, colors) }]}
                />
              </View>

              <Text
                style={styles.chartDay}
              >
                {item.dayLabel}
              </Text>

              <Text
                style={
                  styles.chartScore
                }
              >
                {item.hasData
                  ? `${item.score}%`
                  : "—"}
              </Text>
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

function AlertRow({
  alert,
  colors,
  styles,
}) {
  const wording = formatPumpAlert(alert);
  const severity =
    String(
      alert.severity ||
        ""
    ).toLowerCase();

  const tone = severity === "critical" || severity === "danger" ? "danger" : severity === "warning" ? "warning" : severity === "normal" || severity === "success" ? "success" : "neutral";
  const severityLabel = tone === "danger" ? "Critical" : tone === "warning" ? "Warning" : tone === "success" ? "Normal" : "Info";

  return (
    <AppCard
      style={styles.rowCard}
    >
      <View
        style={[
          styles.rowIcon,

          tone === "danger" &&
            styles.rowIconDanger,

          tone === "warning" &&
            styles.rowIconWarning,
        ]}
      >
        <Ionicons
          name={
            tone === "danger"
              ? "warning-outline"
              : "notifications-outline"
          }
          size={18}
          color={
            tone === "danger"
              ? colors.danger
              : tone ===
                "warning"
              ? colors.warning
              : colors.accent2
          }
        />
      </View>

      <View
        style={styles.flexOne}
      >
        <View
          style={
            styles.rowTitleLine
          }
        >
          <Text
            style={styles.rowTitle}
            
          >
            {wording.title ||
              "Tank Alert"}
          </Text>

          <StatusBadge
            label={severityLabel}
            tone={tone}
            styles={styles}
           colors={colors} />
        </View>

        <Text
          style={styles.rowText}
          
        >
          {formatPhilippineAlertMessage(wording.message) ||
            "No message."}
        </Text>

        <Text
          style={styles.rowDate}
        >
          {formatDateTime(
            alert.created_at
          )}
        </Text>
      </View>
    </AppCard>
  );
}

function ControlLogRow({ log, tank, colors }) {
  return <ActivityEntry item={normalizeActivityEvent('control_logs', log, tank)} colors={colors} />;
}
function StateCard({
  loading = false,
  icon,
  iconColor,
  customIcon,
  title = "Loading",
  text,
  action,
  onPress,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.stateCard}
    >
      <View
        style={styles.stateIcon}
      >
        {loading ? (
          <ActivityIndicator
            color={colors.accent2}
          />
        ) : customIcon ? (
          customIcon
        ) : (
          <Ionicons
            name={
              icon ||
              "information-circle-outline"
            }
            size={31}
            color={
              iconColor ||
              colors.accent2
            }
          />
        )}
      </View>

      <Text
        style={styles.stateTitle}
      >
        {title}
      </Text>

      <Text
        style={styles.stateText}
      >
        {text}
      </Text>

      {action ? (
        <TouchableOpacity
          activeOpacity={0.86}
          style={
            styles.stateButton
          }
          onPress={onPress}
        >
          <Ionicons
            name="refresh-outline"
            size={15}
            color="#062C2B"
          />

          <Text
            style={
              styles.stateButtonText
            }
          >
            {action}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function EmptyMini({
  text,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.emptyMini}
    >
      <View
        style={
          styles.emptyMiniIcon
        }
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={colors.accent2}
        />
      </View>

      <Text
        style={
          styles.emptyMiniText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function StatusBadge({ label, tone, type, colors }) { return <MonitoringBadge result={{ label, tone: tone || type }} colors={colors} />; }

/*
|--------------------------------------------------------------------------
| REPORT DATA
|--------------------------------------------------------------------------
*/

function buildCombinedReading(sensor, ammonia) { return combineMonitoringReadings(sensor, ammonia); }



function ReadingHistoryEvent({ event, thresholds, colors }) {
  const result = evaluateMonitoring(event.reading, thresholds);
  const metrics = event.type === 'ammonia' ? [result.metrics.ammonia]
    : ['temperature', 'ph', 'turbidity', 'water'].map(key => result.metrics[key]);
  return <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, marginBottom: 8 }}>
    <Text style={{ color: colors.textStrong, fontWeight: '700' }}>{event.type === 'ammonia' ? 'Ammonia Reading (manual scan)' : 'Water Reading'}</Text>
    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{formatDateTimeCompact(event.timestamp)}</Text>
    {metrics.map(metric => <Text key={metric.key} style={{ color: monitoringColor(metric.tone, colors), fontSize: 12, lineHeight: 18, marginTop: 4 }}>
      {metric.title}: {metric.displayValue} · {metric.label}
    </Text>)}
  </View>;
}

function buildWeeklyScores(sensorRows, thresholds, referenceTime = getServerNow()) {
  const today = manilaDateKey(referenceTime);
 if (!today) return [];
 const days = [];
 for (let index = 6; index >= 0; index -= 1) {
   const dayKey = shiftManilaDate(today, -index);
   const dayLabel = formatPhilippineDate(manilaDayRange(dayKey).start, { weekday: 'short', month: undefined, day: undefined });
   const latestSensor = getNewestRow(sensorRows.filter(row => getLocalDateKey(row.created_at) === dayKey));
   const result = analyzeReportReading(normalizeSensorReading(latestSensor), thresholds);
   days.push({ dayKey, dayLabel, score: latestSensor ? Number(result.score || 0) : 0,
     hasData: result.availableMetrics > 0, tone: result.tone });
 }
 return days;
}

/*
|--------------------------------------------------------------------------
| CONDITION ANALYSIS
|--------------------------------------------------------------------------
|
| This is a report score based on AVAILABLE monitored values.
| Missing metrics are not automatically counted as warnings.
|
*/

function analyzeReportReading(reading, thresholds = DEFAULT_THRESHOLDS, paired = true) { return evaluateMonitoring(reading, thresholds, { paired }); }















function getStateType(status) { return status === 'Normal' ? 'success' : status === 'Warning' ? 'warning' : status === 'Critical' ? 'danger' : 'neutral'; }





function getNewestRow(rows) {
  return newestMonitoringRow(rows);
}

function getLocalDateKey(value) {
  return manilaDateKey(value);
}



function formatMetricText(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return String(value);
}

function formatShortDate(
  value
) {
  return formatPhilippineDate(value);
}

function formatDateTimeCompact(
  value
) {
  return formatPhilippineDateTime(value, { year: undefined });
}

function formatDateTime(value) {
  return formatPhilippineDateTime(value, { year: undefined }, 'Recently');
}

function formatType(value) {
  if (!value) {
    return "Action";
  }

  return String(value)
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function formatPopulation(tank) {
  if (
    tank.population_label
  ) {
    return tank.population_label;
  }

  const male =
    Number(
      tank.male_count || 0
    );

  const female =
    Number(
      tank.female_count || 0
    );

  const juvenile =
    Number(
      tank.juvenile_count || 0
    );

  if (juvenile > 0) {
    return `${juvenile} juveniles`;
  }

  if (
    male > 0 ||
    female > 0
  ) {
    return `${male} male • ${female} female`;
  }

  return "Population not specified";
}

function prettifyStatus(
  status
) {
  if (!status) {
    return "No data";
  }

  return String(status)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    );
}

function getResultColor(
  type,
  colors
) {
  if (
    type === "danger"
  ) {
    return colors.danger;
  }

  if (
    type === "warning"
  ) {
    return colors.warning;
  }

  if (
    type === "neutral"
  ) {
    return colors.muted2;
  }

  return colors.accent2;
}

function getSourceLabel(tank) {
  if (
    !tank?.latest_reading
  ) {
    return "No recent data";
  }

  if (
    tank.latest_sensor &&
    tank.latest_ammonia
  ) {
    return "Water + manual scan";
  }

  if (
    tank.latest_ammonia
  ) {
    return "Ammonia check";
  }

  return "Sensor reading";
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

    background:
      sourceColors.background ||
      (isDark
        ? COLORS.deep
        : "#F3FFFC"),

    background2:
      sourceColors.background2 ||
      (isDark
        ? COLORS.mid
        : "#E9FAF7"),

    surface:
      sourceColors.surface ||
      (isDark
        ? COLORS.surface
        : "rgba(255,255,255,0.88)"),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (isDark
        ? COLORS.surfaceStrong
        : "rgba(255,255,255,0.97)"),

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

    warning:
      sourceColors.warning ||
      COLORS.warning,

    success:
      sourceColors.success ||
      COLORS.success,

    dangerSoft:
      sourceColors.dangerSoft ||
      (isDark
        ? COLORS.dangerSoft
        : "rgba(248,113,113,0.13)"),

    warningSoft:
      sourceColors.warningSoft ||
      (isDark
        ? COLORS.warningSoft
        : "rgba(251,191,36,0.16)"),

    successSoft:
      sourceColors.successSoft ||
      (isDark
        ? COLORS.successSoft
        : "rgba(74,222,128,0.16)"),
  };
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      paddingHorizontal: 22,
    },

    scroll: {
      paddingTop: 2,
      paddingBottom: 135,
    },

    flexOne: {
      flex: 1,
      minWidth: 0,
    },

    /*
    |--------------------------------------------------------------------------
    | OVERVIEW
    |--------------------------------------------------------------------------
    */

    overviewHero: {
      padding: 15,
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.accentBorder,
      ...SHADOW.soft,
    },

    overviewIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      marginRight: 11,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    overviewWarningIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      marginRight: 11,
      backgroundColor:
        colors.warningSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    overviewTitle: {
      color:
        colors.textStrong,
      fontSize: 14.5,
      fontWeight: "700",
    },

    overviewText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    overviewGrid: {
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    overviewCard: {
      width: "48%",
      padding: 13,
      borderRadius: 18,
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
    },

    overviewSmallIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 9,
    },

    overviewValue: {
      color:
        colors.textStrong,
      fontSize: 21,
      lineHeight: 28,
      fontWeight: "700",
    },

    overviewLabel: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },

    overviewNote: {
      marginTop: 3,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | WEB
    |--------------------------------------------------------------------------
    */

    webCard: {
      marginTop: 11,
      padding: 13,
      borderRadius: 18,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.accentSoft,
      borderColor:
        colors.accentBorder,
    },

    webIcon: {
      width: 45,
      height: 45,
      borderRadius: 14,
      marginRight: 10,
      backgroundColor:
        colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    webTitle: {
      color:
        colors.textStrong,
      fontSize: 12.5,
      fontWeight: "700",
    },

    webText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    webArrow: {
      width: 34,
      height: 34,
      borderRadius: 11,
      marginLeft: 8,
      backgroundColor:
        colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    /*
    |--------------------------------------------------------------------------
    | TANK LIST
    |--------------------------------------------------------------------------
    */

    tankList: {
      gap: 10,
    },

    tankCard: {
      padding: 14,
      borderRadius: 20,
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
    },

    tankTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    tankIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      marginRight: 11,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    tankTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    tankTitle: {
      flex: 1,
      color:
        colors.textStrong,
      fontSize: 13.5,
      fontWeight: "700",
    },

    tankSubtitle: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    tankMetricsRow: {
      marginTop: 12,
      flexDirection: "row",
      gap: 7,
    },

    smallMetric: {
      flex: 1,
      minHeight: 54,
      borderRadius: 13,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
    },

    smallMetricValue: {
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "700",
      textAlign: "center",
    },

    smallMetricLabel: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },

    coverageRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },

    coverageText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    tankFooter: {
      marginTop: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },

    tankFooterText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | DETAIL HEADER
    |--------------------------------------------------------------------------
    */

    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 13,
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 13,
      marginRight: 10,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
      alignItems: "center",
      justifyContent: "center",
    },

    detailTitle: {
      color:
        colors.textStrong,
      fontSize: 19,
      lineHeight: 25,
      fontWeight: "700",
    },

    detailSubtitle: {
      marginTop: 2,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | DETAIL HERO
    |--------------------------------------------------------------------------
    */

    detailHero: {
      padding: 15,
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.accentBorder,
      ...SHADOW.soft,
    },

    detailHeroTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    cardLabel: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "600",
      textTransform:
        "uppercase",
      letterSpacing: 0.6,
    },

    healthScore: {
      marginTop: 8,
      color:
        colors.textStrong,
      fontSize: 34,
      lineHeight: 45,
      fontWeight: "800",
      letterSpacing: -0.7,
    },

    detailHeroText: {
      marginTop: 6,
      color:
        colors.textStrong,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },

    detailHeroSuggestion: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    metricCoverage: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },

    metricCoverageText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    detailHeroIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      marginLeft: 11,
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
    | SENSOR CARDS
    |--------------------------------------------------------------------------
    */

    sensorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    sensorCard: {
      width: "48%",
      minHeight: 127,
      borderRadius: 18,
      backgroundColor:
        colors.surfaceStrong,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 13,
    },

    sensorTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginBottom: 9,
    },

    sensorIcon: {
      width: 35,
      height: 35,
      borderRadius: 11,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    sensorDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        colors.success,
    },

    sensorDotWarning: {
      backgroundColor:
        colors.warning,
    },

    sensorDotDanger: {
      backgroundColor:
        colors.danger,
    },

    sensorDotNeutral: {
      backgroundColor:
        colors.muted2,
    },

    sensorLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    sensorValue: {
      marginTop: 4,
      color:
        colors.textStrong,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "700",
    },

    sensorState: {
      marginTop: 4,
      color: colors.success,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
    },

    sensorStateWarning: {
      color: colors.warning,
    },

    sensorStateDanger: {
      color: colors.danger,
    },

    sensorStateNeutral: {
      color: colors.muted2,
    },

    /*
    |--------------------------------------------------------------------------
    | CHART
    |--------------------------------------------------------------------------
    */

    chartCard: {
      padding: 14,
      borderRadius: 19,
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
    },

    chartLegend: {
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    chartLegendDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        colors.accent2,
    },

    chartLegendText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    chartBars: {
      height: 157,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent:
        "space-between",
      gap: 7,
    },

    chartItem: {
      flex: 1,
      alignItems: "center",
    },

    barTrack: {
      height: 110,
      width: "100%",
      maxWidth: 28,
      borderRadius:
        RADIUS.pill,
      backgroundColor:
        colors.surfaceSoft,
      justifyContent: "flex-end",
      overflow: "hidden",
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    barFill: {
      width: "100%",
      backgroundColor:
        colors.accent,
      borderTopLeftRadius:
        RADIUS.pill,
      borderTopRightRadius:
        RADIUS.pill,
    },

    barFillEmpty: {
      backgroundColor:
        colors.border,
    },

    chartDay: {
      marginTop: 7,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    chartScore: {
      marginTop: 2,
      color:
        colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    /*
    |--------------------------------------------------------------------------
    | ALERT / CONTROL ROWS
    |--------------------------------------------------------------------------
    */

    listStack: {
      gap: 9,
    },

    rowCard: {
      padding: 12,
      borderRadius: 17,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
    },

    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },

    rowIconWarning: {
      backgroundColor:
        colors.warningSoft,
    },

    rowIconDanger: {
      backgroundColor:
        colors.dangerSoft,
    },

    rowTitleLine: { flexWrap: "wrap",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },

    rowTitle: {
      flex: 1,
      color:
        colors.textStrong,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
    },

    rowText: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    rowDate: {
      marginTop: 6,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    /*
    |--------------------------------------------------------------------------
    | EMPTY STATES
    |--------------------------------------------------------------------------
    */

    emptyMini: {
      borderRadius: 17,
      padding: 12,
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
      flexDirection: "row",
      alignItems: "center",
    },

    emptyMiniIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor:
        colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
    },

    emptyMiniText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    stateCard: {
      minHeight: 210,
      borderRadius: 21,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
      padding: 22,
      alignItems: "center",
      justifyContent: "center",
    },

    stateIcon: {
      width: 64,
      height: 64,
      borderRadius: 21,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    stateTitle: {
      marginTop: 12,
      color:
        colors.textStrong,
      fontSize: 14.5,
      fontWeight: "700",
      textAlign: "center",
    },

    stateText: {
      marginTop: 5,
      maxWidth: 300,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },

    stateButton: {
      marginTop: 14,
      minHeight: 44,
      paddingHorizontal: 13,
      borderRadius:
        RADIUS.pill,
      backgroundColor:
        colors.accent,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },

    stateButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "600",
    },

    smallButton: {
      minHeight: 44,
      borderRadius:
        RADIUS.pill,
      paddingHorizontal: 12,
      backgroundColor:
        colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },

    smallButtonText: {
      color: "#062C2B",
      fontSize: 12,
      fontWeight: "600",
    },

    /*
    |--------------------------------------------------------------------------
    | STATUS
    |--------------------------------------------------------------------------
    */

    statusBadge: {
      minHeight: 24,
      paddingHorizontal: 7,
      borderRadius:
        RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
      borderWidth: 1,
    },

    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    statusBadgeText: {
      fontSize: 12,
      fontWeight: "600",
    },

    successBadge: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.20)",
    },

    warningBadge: {
      backgroundColor:
        colors.warningSoft,
      borderColor:
        "rgba(251,191,36,0.20)",
    },

    dangerBadge: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.20)",
    },

    neutralBadge: {
      backgroundColor:
        colors.surfaceSoft,
      borderColor:
        colors.border,
    },

    successDot: {
      backgroundColor:
        colors.success,
    },

    warningDot: {
      backgroundColor:
        colors.warning,
    },

    dangerDot: {
      backgroundColor:
        colors.danger,
    },

    neutralDot: {
      backgroundColor:
        colors.muted2,
    },

    successBadgeText: {
      color: colors.success,
    },

    warningBadgeText: {
      color: colors.warning,
    },

    dangerBadgeText: {
      color: colors.danger,
    },

    neutralBadgeText: {
      color: colors.muted,
    },
  });
}
