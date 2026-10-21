// src/screens/main/DeviceWifiSetupScreen.js
import { Ionicons } from '@expo/vector-icons';
import { fetch as fetchWithoutRedirects } from 'expo/fetch';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CrayfishIcon from '../../components/icons/CrayfishIcon';
import AppButton from '../../components/ui/AppButton';
import AppCard from '../../components/ui/AppCard';
import AppHeader from '../../components/ui/AppHeader';
import AppScreen from '../../components/ui/AppScreen';
import { COLORS, RADIUS, SHADOW } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import useSingleFlight from '../../hooks/useSingleFlight';
import { supabase } from '../../lib/supabase';
import { resolveEsp32BaseUrls } from '../../utils/deviceUrls';
import { findEsp32Wifi, getDeviceOnlineLabel, getSetupHotspot, postEsp32Wifi, readWifiDeviceSnapshot, waitForWifiHeartbeat } from '../../utils/deviceWifi';
import { getServerNow } from '../../utils/serverClock';
import { formatPhilippineDateTime } from '../../utils/philippineTime';

export default function DeviceWifiSetupScreen({ tank, device, onBack }) {
  const { colors, styles } = useThemePack();
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [focusedField, setFocusedField] = useState('');
  const [cloudDevice, setCloudDevice] = useState(device);
  const [localStatus, setLocalStatus] = useState(null);
  const [localState, setLocalState] = useState('Not checked');
  const [reachableBase, setReachableBase] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [saveNotice, setSaveNotice] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [, setClockTick] = useState(0);
  const active = useRef(null);
  const actionLock = useRef(false);
  const mounted = useRef(false);
  const clockAnchor = useRef(null);
  const pendingHeartbeat = useRef(null);
  const busy = ['checking', 'saving', 'reconnecting', 'forgetting', 'waiting'].includes(phase);
  const hotspotLabel = getSetupHotspot(device) || 'the setup hotspot printed on your device';
  const deviceLabel = getDeviceLabel(device);
  const deviceIcon = getDeviceIcon(device);
  const tankName = tank?.tank_name || 'Selected Tank';
  const currentDevice = cloudDevice || device;
  const cloudNow = clockAnchor.current
    ? new Date(clockAnchor.current.epoch + performance.now() - clockAnchor.current.tick)
    : getServerNow();
  const connectionStatus = phase === 'waiting' ? 'Reconnecting'
    : phase === 'retry' ? 'Connection Unconfirmed'
    : phase === 'setup' ? 'Setup / Offline'
    : getDeviceOnlineLabel(currentDevice, cloudNow, localStatus);
  const wifiPageUrl = `${reachableBase || resolveEsp32BaseUrls(currentDevice)[0]}/wifi`;

  function applySnapshot(snapshot) {
    clockAnchor.current = { epoch: new Date(snapshot.serverTime).getTime(), tick: performance.now() };
    setCloudDevice(snapshot.device);
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setCloudDevice(device);
    setLocalStatus(null);
    setLocalState('Not checked');
    setDetailsExpanded(false);
    setReachableBase(null);
    setPhase('idle');
    setMessage('');
    setSaveNotice('');
    setWifiPassword('');
    pendingHeartbeat.current = null;
    clockAnchor.current = null;
    if (device?.device_uid) {
      readWifiDeviceSnapshot(supabase, device.device_uid, controller.signal).then(snapshot => {
        if (mounted.current && !controller.signal.aborted && !actionLock.current) applySnapshot(snapshot);
      }).catch(() => {});
    }
    const timer = setInterval(() => setClockTick(value => value + 1), 15000);
    return () => {
      mounted.current = false;
      controller.abort();
      active.current?.abort();
      clearInterval(timer);
    };
  }, [device]);

  function showMessage(type, text) {
    setMessageType(type);
    setMessage(text);
  }

  async function waitForDevice(controller) {
    setPhase('waiting');
    showMessage('info', 'Waiting for ESP32 to reconnect… Switch your phone to the new hotspot or another network with internet so CrayThrive can check the cloud. The ESP32 may be rebooting.');
    const result = await waitForWifiHeartbeat({
      db: supabase, deviceUid: device.device_uid, ...pendingHeartbeat.current,
      signal: controller.signal,
      onSnapshot: snapshot => { if (mounted.current) applySnapshot(snapshot); },
    });
    if (!mounted.current || controller.signal.aborted) return;
    if (result.timedOut) {
      setPhase('retry');
      showMessage('warning', result.cloudUnavailable
        ? 'Cloud confirmation is temporarily unavailable. Your phone may still be on the setup hotspot without internet, or Supabase may be offline. Connect the phone to an internet network and tap Retry Connection Check. WiFi connection has not been confirmed.'
        : 'No fresh ESP32 heartbeat arrived within 45 seconds. It may still be restarting, or the new hotspot name/password may be wrong. Check hotspot availability and 2.4 GHz support, then retry the check or use the setup steps below.');
      return;
    }
    setPhase('connected');
    setReachableBase(null);
    setLocalStatus(null);
    setLocalState('Check again after restart');
    showMessage('success', 'The ESP32 is online again, confirmed by a fresh cloud heartbeat and a local address in the refreshed device record. Check WiFi Status on its network to see which hotspot it joined; the firmware may have used a backup network.');
  }

  const runAction = useSingleFlight(async function runAction(action) {
    if (actionLock.current || !device?.device_uid) return;
    if (action === 'save' && !wifiSsid.trim()) {
      showMessage('error', 'Enter the WiFi name / SSID.');
      return;
    }
    actionLock.current = true;
    const controller = new AbortController();
    active.current = controller;
    setConfirmForget(false);
    setPhase(action === 'status' ? 'checking' : action === 'save' ? 'saving' : action === 'forget' ? 'forgetting' : 'reconnecting');
    setMessage('');
    if (action !== 'status' && action !== 'retry') setSaveNotice('');
    try {
      if (action === 'retry') { await waitForDevice(controller); return; }
      let baseline = currentDevice;
      if (action !== 'status') {
        try {
          const snapshot = await readWifiDeviceSnapshot(supabase, device.device_uid, controller.signal);
          if (controller.signal.aborted) return;
          applySnapshot(snapshot);
          baseline = snapshot.device;
        } catch { /* The setup AP may have no internet access. */ }
      }
      if (controller.signal.aborted) return;
      // Identity is verified at a reachable address before any WiFi command.
      const target = await findEsp32Wifi(baseline, fetchWithoutRedirects, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setLocalStatus(target.status);
      setLocalState(target.status.setup_mode ? 'Setup Mode' : target.status.wifi_connected ? 'Connected' : 'Offline');
      setReachableBase(target.baseUrl);
      if (action === 'status') {
        showMessage('info', 'Local device status checked. Cloud status uses the last heartbeat, separately from the local WiFi connection.');
        try {
          const snapshot = await readWifiDeviceSnapshot(supabase, device.device_uid, controller.signal);
          if (mounted.current && !controller.signal.aborted) applySnapshot(snapshot);
        } catch {
          if (mounted.current && !controller.signal.aborted) {
            showMessage('warning', 'Local WiFi status was checked. Cloud information could not be refreshed. Your phone may have no internet on the setup hotspot, or Supabase may be temporarily unavailable. The cloud address and heartbeat shown below are the last known values.');
          }
        }
        if (mounted.current && !controller.signal.aborted) setPhase('idle');
        return;
      }
      pendingHeartbeat.current = { baseline, commandStartedAt: performance.now() };
      await postEsp32Wifi(target, action, { ssid: wifiSsid.trim(), password: wifiPassword }, fetchWithoutRedirects, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      pendingHeartbeat.current.commandStartedAt = performance.now();
      setLocalStatus(null);
      setReachableBase(null);
      setLocalState('Device restarting');
      if (action === 'forget') {
        pendingHeartbeat.current = null;
        setWifiPassword('');
        setSaveNotice('');
        setPhase('setup');
        showMessage('info', `WiFi profiles cleared. The ESP32 is restarting into setup mode. Join ${hotspotLabel} in your phone’s WiFi settings (password: craythrive123), then return here and use http://192.168.4.1. The device is still paired to this tank.`);
        setReachableBase('http://192.168.4.1');
        return;
      }
      if (action === 'save') {
        setWifiPassword('');
        setSaveNotice('WiFi saved. The ESP32 is restarting and will try the new hotspot first. Its previous WiFi is retained as a backup.');
      } else {
        setSaveNotice('Reconnect requested. The ESP32 will retry its saved primary, backup and default WiFi networks.');
      }
      await waitForDevice(controller);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (error.code === 'uncertain') {
        setLocalStatus(null);
        setLocalState('Restart or request failure');
        setPhase(action === 'forget' ? 'setup' : 'retry');
        showMessage('warning', `${error.message} ${action === 'forget'
          ? `Look for ${hotspotLabel} (password: craythrive123). If it is absent, check status before trying Forget again. Pairing is unchanged.`
          : 'Use Retry Connection Check to look for a fresh heartbeat before submitting again.'}`);
      } else {
        setPhase('idle');
        setLocalStatus(null);
        setReachableBase(null);
        setLocalState(error.code === 'identity' ? 'Wrong device / Unreachable' : 'Unreachable');
        showMessage('error', error.message || 'Unable to check the device. Follow the setup steps below and try again.');
      }
    } finally {
      if (active.current === controller) active.current = null;
      actionLock.current = false;
    }
  });

  async function openWifiSettings() {
    try { await Linking.sendIntent('android.settings.WIFI_SETTINGS'); }
    catch { showMessage('info', 'Open your phone’s Settings app and choose WiFi, then return to CrayThrive.'); }
  }

  async function openEsp32WifiPage(setup = false) {
    try { await Linking.openURL(setup ? 'http://192.168.4.1/wifi' : wifiPageUrl); }
    catch { showMessage('error', 'Unable to open the setup page. Join the ESP32 setup hotspot or the same local WiFi, then try again.'); }
  }

  const recoverySteps = [
    ['A', 'Open phone WiFi settings.', 'CrayThrive cannot switch your phone’s WiFi automatically.'],
    ['B', `Join ${hotspotLabel}.`, 'Setup hotspot password: craythrive123. Stay connected even if the phone says there is no internet.'],
    ['C', 'Return to CrayThrive.', 'The app also tries http://192.168.4.1 when the old local address cannot be reached.'],
    ['D', 'Enter the NEW hotspot SSID/password.', 'Keep the new router or mobile hotspot on and allow 2.4 GHz connections.'],
    ['E', 'Tap Save & Switch WiFi.', 'After saving, reconnect your phone to an internet network for cloud confirmation.'],
  ];
  const statusRows = [
    ['Local WiFi status', localState],
    ['Current SSID', localStatus?.connected_ssid || 'Not available'],
    ['Signal strength', localStatus?.rssi != null ? `${localStatus.rssi} dBm` : 'Not available'],
    ['Current local IP', localStatus?.local_ip || 'Not checked'],
    ['Primary saved SSID', localStatus?.saved_ssid || 'None reported'],
    ['Backup SSID 1', localStatus?.backup_ssid_1 || 'None reported'],
    ['Backup SSID 2', localStatus?.backup_ssid_2 || 'None reported'],
    ['Firmware version', localStatus?.firmware_version || 'Not available'],
    ['Cloud last seen', formatPhilippineDateTime(currentDevice?.last_seen, {}, 'Not available')],
    ['Last cloud local IP (may be stale)', currentDevice?.local_ip || 'Not available'],
  ];

  return (
    <AppScreen keyboard onBack={onBack}>
      <View style={styles.root}>
        <AppHeader eyebrow="Device Setup" title="Wi-Fi Setup" subtitle={`${deviceLabel} • ${tankName}`}
          icon={deviceIcon} rightAction="close-outline" onRightPress={onBack} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {saveNotice ? <MessageBox type="info" message={saveNotice} colors={colors} styles={styles} /> : null}
          {message ? <MessageBox type={messageType} message={message} colors={colors} styles={styles} /> : null}
          {phase === 'waiting' ? <ActivityIndicator color={colors.accent2} accessibilityLabel="Waiting for ESP32 to reconnect" /> : null}
          <AppCard strong style={styles.deviceCard}>
            <View style={styles.deviceIcon}><Ionicons name={deviceIcon} size={24} color={colors.accent2} /></View>
            <View style={styles.deviceContent}>
              <Text style={styles.deviceTitle}>{deviceLabel}</Text>
              <Text style={styles.deviceUid}>{device?.device_uid || 'No device selected'}</Text>
              <Text style={styles.deviceTank}>Assigned to {tankName}</Text>
              <ConnectionBadge status={connectionStatus} styles={styles} />
            </View>
          </AppCard>
          <SectionHeader title="WiFi Status" styles={styles} />
          <AppButton title={phase === 'checking' ? 'Checking WiFi…' : 'Check WiFi Status'} icon="refresh-outline" variant="soft"
            disabled={busy || !device?.device_uid} onPress={() => runAction('status')} />
          <View style={styles.detailsCard}>
            {localStatus ? statusRows.slice(0, 4).map(([label, value]) => <DetailRow key={label} icon="wifi-outline" label={label} value={value} colors={colors} styles={styles} />)
              : <Text style={[styles.setupPageText, { padding: 12, marginTop: 0 }]}>{localState}. Check status while your phone is on the same WiFi or the device’s setup hotspot.</Text>}
            {detailsExpanded ? statusRows.slice(4).map(([label, value]) => <DetailRow key={label} icon="information-circle-outline" label={label} value={value} colors={colors} styles={styles} />) : null}
          </View>
          <AppButton title={detailsExpanded ? 'Hide Device Details' : 'Saved Networks & Device Details'}
            icon={detailsExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} variant="ghost"
            onPress={() => setDetailsExpanded(value => !value)} style={{ marginTop: 8 }} />
          {phase === 'retry' ? <AppButton title="Retry Connection Check" icon="refresh-outline" onPress={() => runAction('retry')} style={{ marginTop: 12 }} /> : null}
          <SectionHeader title="Change WiFi / Another Hotspot" styles={styles} />
          <AppCard strong style={styles.formCard}>
            <Text style={styles.formSubtitle}>Changing WiFi keeps this device paired to its tank. Saved networks are managed by the ESP32.</Text>
            <FormInput label="Wi-Fi name / SSID" value={wifiSsid} onChangeText={setWifiSsid} placeholder="Enter Wi-Fi name" icon="wifi-outline"
              editable={!busy} focused={focusedField === 'ssid'} onFocus={() => setFocusedField('ssid')} onBlur={() => setFocusedField('')} colors={colors} styles={styles} />
            <PasswordInput label="Wi-Fi password" value={wifiPassword} onChangeText={setWifiPassword}
              editable={!busy} focused={focusedField === 'password'} onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField('')} colors={colors} styles={styles} />
            <Text style={styles.securityNoteText}>The password goes directly to the selected ESP32’s local server. Saved WiFi passwords are never displayed.</Text>
            <AppButton title={phase === 'saving' ? 'Sending WiFi…' : 'Save & Switch WiFi'} icon="save-outline"
              disabled={busy || !wifiSsid.trim() || !device?.device_uid} onPress={() => runAction('save')} style={{ marginTop: 12 }} />
            <AppButton title="Reconnect Saved WiFi" icon="wifi-outline" variant="soft" disabled={busy || !device?.device_uid}
              onPress={() => runAction('reconnect')} style={{ marginTop: 12 }} />
            <AppButton title="Forget WiFi / Setup Mode" icon="trash-outline" variant="danger" disabled={busy || !device?.device_uid}
              onPress={() => setConfirmForget(true)} style={{ marginTop: 12 }} />
          </AppCard>
          <SectionHeader title="Old Hotspot Gone? Recover Here" styles={styles} />
          <Text style={[styles.setupPageText, { marginBottom: 12 }]}>After failed reconnect attempts, the ESP32 automatically opens its setup hotspot and keeps saved networks available. Only Forget WiFi clears them.</Text>
          <View style={styles.stepsCard}>
            {recoverySteps.map(([number, title, text], index) => <React.Fragment key={number}>
              {index ? <StepDivider styles={styles} /> : null}
              <SetupStep number={number} title={title} text={text} styles={styles} />
            </React.Fragment>)}
          </View>
          {Platform.OS === 'android' ? <AppButton title="Open WiFi Settings" icon="settings-outline" variant="soft" onPress={openWifiSettings} style={{ marginTop: 12 }} /> : null}
          <SectionHeader title="Browser Setup Fallback" styles={styles} />
          <AppCard strong noShadow style={styles.setupPageCard}>
            <Text selectable style={styles.setupPageUrl}>{wifiPageUrl}</Text>
            <Text style={styles.setupPageText}>Use the browser if the local API is unavailable. Choose the setup hotspot address after joining the correct device’s hotspot.</Text>
            <AppButton title="Open Setup Page" icon="open-outline" variant="soft" onPress={() => openEsp32WifiPage()} style={{ marginTop: 12 }} />
            <AppButton title="Open 192.168.4.1 Setup" icon="open-outline" variant="ghost" onPress={() => openEsp32WifiPage(true)} style={{ marginTop: 12 }} />
          </AppCard>
          <View style={styles.footerNote}>
            <CrayfishIcon size={17} color={colors.muted2} />
            <Text style={styles.footerNoteText}>Configure one ESP32 at a time. Status must match the selected device before any WiFi command is sent.</Text>
          </View>
        </ScrollView>
        <Modal visible={confirmForget} transparent animationType="fade" onRequestClose={() => setConfirmForget(false)}>
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <AppCard strong style={styles.formCard}>
              <Text style={styles.sectionTitle}>Forget WiFi / Setup Mode?</Text>
              <Text style={[styles.setupPageText, { marginBottom: 16 }]}>This only clears the ESP32’s saved WiFi profiles and restarts it in setup mode. It does NOT unpair the device or remove it from this tank. You will need to join {hotspotLabel} (password: craythrive123) to set up WiFi again.</Text>
              <AppButton title="Cancel" variant="ghost" onPress={() => setConfirmForget(false)} />
              <AppButton title="Forget WiFi" variant="danger" disabled={busy} onPress={() => runAction('forget')} style={{ marginTop: 12 }} />
            </AppCard>
          </View>
        </Modal>
      </View>
    </AppScreen>
  );
}
function SectionHeader({
  title,
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
    </View>
  );
}

function SetupStep({
  number,
  title,
  text,
  styles,
}) {
  return (
    <View style={styles.stepRow}>
      <View
        style={styles.stepNumber}
      >
        <Text
          style={
            styles.stepNumberText
          }
        >
          {number}
        </Text>
      </View>

      <View
        style={
          styles.stepContent
        }
      >
        <Text
          style={styles.stepTitle}
        >
          {title}
        </Text>

        <Text
          style={styles.stepText}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function StepDivider({
  styles,
}) {
  return (
    <View
      style={styles.stepDivider}
    />
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  editable,
  focused,
  onFocus,
  onBlur,
  colors,
  styles,
}) {
  return (
    <View style={styles.formGroup}>
      <Text
        style={styles.inputLabel}
      >
        {label}
      </Text>

      <View
        style={[
          styles.inputBox,

          focused &&
            styles.inputBoxFocused,

          !editable &&
            styles.inputBoxDisabled,
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
            colors.inputPlaceholder
          }
          style={
            styles.textInput
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

function PasswordInput({
  label,
  value,
  onChangeText,
  editable,
  focused,
  onFocus,
  onBlur,
  colors,
  styles,
}) {
  return (
    <View style={styles.formGroup}>
      <Text
        style={styles.inputLabel}
      >
        {label}
      </Text>

      <View
        style={[
          styles.inputBox,

          focused &&
            styles.inputBoxFocused,

          !editable &&
            styles.inputBoxDisabled,
        ]}
      >
        <View
          style={styles.inputIcon}
        >
          <Ionicons
            name="lock-closed-outline"
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
          placeholder="Enter Wi-Fi password"
          placeholderTextColor={
            colors.inputPlaceholder
          }
          style={
            styles.textInput
          }
          secureTextEntry
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

function DetailRow({
  icon,
  label,
  value,
  colors,
  styles,
}) {
  return (
    <View
      style={styles.detailRow}
    >
      <View
        style={
          styles.detailIcon
        }
      >
        <Ionicons
          name={icon}
          size={17}
          color={colors.accent2}
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
          selectable
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function ConnectionBadge({
  status,
  styles,
}) {
  const normalized =
    String(status || "")
      .toLowerCase();

  const connected =
    normalized ===
      "connected" ||
    normalized === "online";

  return (
    <View
      style={[
        styles.statusBadge,
        connected
          ? styles.statusConnected
          : styles.statusNeutral,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          connected
            ? styles.statusDotConnected
            : styles.statusDotNeutral,
        ]}
      />

      <Text
        style={[
          styles.statusText,
          connected
            ? styles.statusTextConnected
            : styles.statusTextNeutral,
        ]}
      >
        {status}
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
    type === "success";

  const error =
    type === "error";

  return (
    <View
      style={[
        styles.messageBox,

        success &&
          styles.messageSuccess,

        error &&
          styles.messageError,
      ]}
    >
      <Ionicons
        name={
          success
            ? "checkmark-circle-outline"
            : error
            ? "alert-circle-outline"
            : "information-circle-outline"
        }
        size={18}
        color={
          success
            ? colors.success
            : error
            ? colors.danger
            : colors.accent2
        }
      />

      <Text
        style={[
          styles.messageText,

          success && {
            color:
              colors.success,
          },

          error && {
            color:
              colors.danger,
          },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

function getDeviceIcon(device) {
  const type = String(
    `${device?.device_type || ''} ${device?.device_uid || ''}`
  ).toLowerCase();

  if (
    type.includes("actuator") ||
    type.includes("pump") ||
    type.includes("relay") ||
    type.includes("feeder")
  ) {
    return "flash-outline";
  }

  return "hardware-chip-outline";
}

function getDeviceLabel(device) {
  const type = String(
    `${device?.device_type || ''} ${device?.device_uid || ''}`
  ).toLowerCase();

  if (
    type.includes("actuator") ||
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

function useThemePack() {
  const theme = useAppTheme();

  const isDark =
    theme?.isDark ?? true;

  const colors = useMemo(() => {
    return normalizeColors(
      theme?.colors || COLORS,
      isDark
    );
  }, [
    theme?.colors,
    isDark,
  ]);

  const styles = useMemo(() => {
    return makeStyles(colors);
  }, [colors]);

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
      paddingHorizontal: 22,
    },

    scroll: {
      paddingTop: 3,
      paddingBottom: 140,
    },

    /*
    |--------------------------------------------------------------------------
    | MESSAGE
    |--------------------------------------------------------------------------
    */

    messageBox: {
      marginBottom: 12,
      padding: 11,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    messageSuccess: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.20)",
    },

    messageError: {
      backgroundColor:
        colors.dangerSoft,
      borderColor:
        "rgba(248,113,113,0.20)",
    },

    messageText: {
      flex: 1,
      color: colors.accent2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },

    /*
    |--------------------------------------------------------------------------
    | DEVICE
    |--------------------------------------------------------------------------
    */

    deviceCard: {
      padding: 14,
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surfaceStrong,
      borderColor:
        colors.border,
      ...SHADOW.soft,
    },

    deviceIcon: {
      width: 52,
      height: 52,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 11,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    deviceContent: {
      flex: 1,
      minWidth: 0,
    },

    deviceTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    deviceTitle: {
      flex: 1,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "700",
    },

    deviceUid: {
      marginTop: 4,
      color: colors.muted,
      fontSize: 12,
      fontWeight: "500",
    },

    deviceTank: {
      marginTop: 2,
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "400",
    },

    statusBadge: {
      minHeight: 25,
      paddingHorizontal: 8,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
    },

    statusConnected: {
      backgroundColor:
        colors.successSoft,
      borderColor:
        "rgba(74,222,128,0.20)",
    },

    statusNeutral: {
      backgroundColor:
        colors.surfaceSoft,
      borderColor:
        colors.border,
    },

    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    statusDotConnected: {
      backgroundColor:
        colors.success,
    },

    statusDotNeutral: {
      backgroundColor:
        colors.muted2,
    },

    statusText: {
      fontSize: 12,
      fontWeight: "600",
    },

    statusTextConnected: {
      color: colors.success,
    },

    statusTextNeutral: {
      color: colors.muted,
    },

    /*
    |--------------------------------------------------------------------------
    | SECTIONS
    |--------------------------------------------------------------------------
    */

    sectionHeader: {
      marginTop: 23,
      marginBottom: 11,
    },

    sectionTitle: {
      color: colors.textStrong,
      fontSize: 16,
      fontWeight: "700",
    },

    /*
    |--------------------------------------------------------------------------
    | STEPS
    |--------------------------------------------------------------------------
    */

    stepsCard: {
      paddingHorizontal: 13,
      paddingVertical: 3,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    stepRow: {
      minHeight: 73,
      flexDirection: "row",
      alignItems: "center",
    },

    stepNumber: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    stepNumberText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "700",
    },

    stepContent: {
      flex: 1,
    },

    stepTitle: {
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    stepText: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    stepDivider: {
      height: 1,
      marginLeft: 44,
      backgroundColor:
        colors.border,
    },

    /*
    |--------------------------------------------------------------------------
    | LOCAL PAGE
    |--------------------------------------------------------------------------
    */

    setupPageCard: {
      padding: 14,
      borderRadius: 18,
    },

    setupPageTop: {
      flexDirection: "row",
      alignItems: "center",
    },

    setupPageIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
    },

    setupPageContent: {
      flex: 1,
      minWidth: 0,
    },

    setupPageTitle: {
      color: colors.textStrong,
      fontSize: 12.5,
      fontWeight: "600",
    },

    setupPageUrl: {
      marginTop: 2,
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "500",
    },

    setupPageText: {
      marginTop: 11,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    openButton: {
      marginTop: 12,
      minHeight: 44,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    openButtonText: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "600",
    },

    /*
    |--------------------------------------------------------------------------
    | FORM
    |--------------------------------------------------------------------------
    */

    formCard: {
      padding: 15,
      borderRadius: 20,
    },

    formIntro: {
      marginBottom: 17,
      flexDirection: "row",
      alignItems: "center",
    },

    formIntroIcon: {
      width: 45,
      height: 45,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
    },

    formIntroContent: {
      flex: 1,
    },

    formTitle: {
      color: colors.textStrong,
      fontSize: 13.5,
      fontWeight: "700",
    },

    formSubtitle: {
      marginTop: 3,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    formGroup: {
      marginBottom: 16,
    },

    inputLabel: {
      marginBottom: 8,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    inputBox: {
      minHeight: 56,
      paddingHorizontal: 10,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        colors.surfaceSoft,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    inputBoxFocused: {
      backgroundColor:
        colors.surface,
      borderColor:
        colors.accentBorder,
    },

    inputBoxDisabled: {
      opacity: 0.58,
    },

    inputIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 9,
      backgroundColor:
        colors.accentSoft,
    },

    textInput: {
      flex: 1,
      minHeight: 54,
      paddingVertical: 0,
      color: colors.textStrong,
      fontSize: 14,
      fontWeight: "500",
    },

    eyeButton: {
      width: 44,
      height: 44,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },

    securityNote: {
      marginTop: -1,
      marginBottom: 16,
      padding: 10,
      borderRadius: 13,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      backgroundColor:
        colors.accentSoft,
      borderWidth: 1,
      borderColor:
        colors.accentBorder,
    },

    securityNoteText: {
      flex: 1,
      color: colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },

    saveButton: {
      marginTop: 1,
    },

    /*
    |--------------------------------------------------------------------------
    | DETAILS
    |--------------------------------------------------------------------------
    */

    detailsCard: {
      paddingHorizontal: 13,
      paddingVertical: 3,
      borderRadius: 18,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    detailRow: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
    },

    detailIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor:
        colors.accentSoft,
    },

    detailContent: {
      flex: 1,
      minWidth: 0,
    },

    detailLabel: {
      color: colors.muted2,
      fontSize: 12,
      fontWeight: "500",
    },

    detailValue: {
      marginTop: 2,
      color: colors.textStrong,
      fontSize: 12,
      fontWeight: "600",
    },

    detailDivider: {
      height: 1,
      marginLeft: 46,
      backgroundColor:
        colors.border,
    },

    footerNote: {
      marginTop: 18,
      paddingHorizontal: 4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },

    footerNoteText: {
      flex: 1,
      color: colors.muted2,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },
  });
}
