import { formatPhilippineDateTime, formatPhilippineTime } from '../../utils/philippineTime';
import { fetchServerTime, getServerNow } from '../../utils/serverClock';
import SensorReadingCard, { MonitoringBadge, SensorSafeRange } from '../../components/tank/SensorReadingCard';
import { evaluateMonitoring, combineMonitoringReadings, monitoringColor, formatReadingValue, formatAmmoniaTimestamp, fetchPairedTankIds, fetchLatestMonitoringRows , mergeMonitoringTank, monitoringRequestVersion } from '../../utils/sensorMonitoring';
// src/screens/main/AiGuideScreen.js

import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

import {
  analyzeTankReading,
  formatTankPopulation,
} from "../../utils/tankRules";

import {
  DEFAULT_THRESHOLDS,
  fetchTankThresholdSettings,
  normalizeThresholds,
} from "../../utils/thresholdSettings";

import {
  applyAiThresholdSuggestion,
  askCrayThriveAi,
  getAiFailureMessage,
  buildAiTankContext,
} from "../../services/aiGuideService";

import GuideLessonDetailsScreen, {
  GUIDE_LESSONS,
} from "./GuideLessonDetailsScreen";
import useSingleFlight from '../../hooks/useSingleFlight';
import useMonitoringSync from '../../hooks/useMonitoringSync';
import useKeyboardVisible from '../../hooks/useKeyboardVisible';

const MODES = [
  {
    key: "ask",
    label: "Ask AI",
    icon: "chatbubble-ellipses-outline",
  },
  {
    key: "check",
    label: "Tank Check",
    icon: "analytics-outline",
  },
  {
    key: "guide",
    label: "Guide",
    icon: "book-outline",
  },
];

const QUICK_PROMPTS = [
  "Ano ang current condition ng tank na ito?",
  "Ano ang dapat kong gawin muna?",
  "Pwede ba akong magpakain ngayon?",
  "May reading ba na kailangan bantayan?",
  "Review my current thresholds.",
  "Compare the latest and previous readings.",
];

const THRESHOLD_PREVIEW_QUESTION = "I want to preview a threshold change. Ask me which parameter and values to use, then show a proposal with Apply Threshold. Do not save anything without my confirmation.";

const ACTION_LABELS = {
  recommendation_only:
    "AI Recommendation",

  suggest_skip_feed:
    "Feeding Suggestion",

  suggest_fill:
    "Refill Suggestion",

  suggest_drain:
    "Drain Suggestion",

  suggest_threshold_change:
    "Threshold Suggestion",

  warning:
    "Warning",
};

export default function AiGuideScreen({ initialTankId = null } = {}) {
  const keyboardVisible = useKeyboardVisible();
  const {
    colors,
    styles
  } = useThemePack();
  const [activeMode, setActiveMode] = useState("ask");
  const [selectedLessonKey, setSelectedLessonKey] = useState(null);
  const [tanks, setTanks] = useState([]);
  const loadGuard=useRef({active:true,generation:0});
  const monitoringSync = useMonitoringSync(tanks.map(getTankId), snapshot => {
    setTanks(current => current.map(tank => {
      const id=String(tank.id), sensor=snapshot.sensors.find(row=>String(row.tank_id)===id) || null,
        scan=snapshot.scans.find(row=>String(row.tank_id)===id) || null;
      if(String(tank.user_id)!==String(snapshot.userId)) return tank;
      return mergeMonitoringTank(tank,{...tank,latest_sensor:sensor,latest_ammonia:scan,
        latest_reading:combineMonitoringReadings(sensor,scan),monitoring_thresholds:snapshot.thresholds[id],
        has_paired_device:snapshot.paired.has(id),monitoring_version:snapshot.version});
    }));
  }, () => {loadGuard.current.generation++;setTanks([]);});
  const [selectedTankId, setSelectedTankId] = useState(initialTankId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [chatByTank, setChatByTank] = useState({});
  const [inputText, setInputText] = useState("");
  const [sendingAi, setSendingAi] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState(null);
  const chatScrollRef = useRef(null);
  const sendLock = useRef(false);
  const appliedSuggestionIds = useRef(new Set());
  const selectedTank = useMemo(() => {
    if (!selectedTankId && tanks.length > 0) {
      return tanks[0];
    }
    return tanks.find(tank => String(getTankId(tank)) === String(selectedTankId)) || null;
  }, [selectedTankId, tanks]);
  const thresholds = selectedTank?.monitoring_thresholds || DEFAULT_THRESHOLDS;
  const selectedTankRef = useRef(null);
  selectedTankRef.current = selectedTankId;
  const selectedReading = selectedTank?.latest_reading || null;
  const ruleResult = useMemo(() => {
    return analyzeTankReading(selectedReading, Boolean(selectedReading), thresholds, { paired: Boolean(selectedTank?.has_paired_device) });
  }, [selectedReading, thresholds, selectedTank?.has_paired_device]);
  const selectedMessages = useMemo(() => {
    if (!selectedTankId) {
      return [];
    }
    return chatByTank[String(selectedTankId)] || [];
  }, [chatByTank, selectedTankId]);
  const loadGuideData = useSingleFlight(useCallback(async (showLoader = false) => {
  const monitoringVersion = monitoringRequestVersion();
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
      await fetchServerTime().catch(() => null);
      const {
        data: tankData,
        error: tankError
      } = await supabase.from("tanks").select("*").eq("user_id", userId).order("created_at", {
        ascending: false
      });
      if (tankError) {
        console.log("AI GUIDE TANK ERROR:");
        setMessage("Unable to load tanks.");
        return;
      }
      const tankList = tankData || [];
      const tankIds = tankList.map(getTankId).filter(Boolean);
      const thresholdsByTank = await fetchTankThresholdSettings(userId, tankIds);
      const pairedIds = await fetchPairedTankIds(userId, tankIds);
      const latestSensorByTank = {};
      const latestAmmoniaByTank = {};
      const latestRows = await fetchLatestMonitoringRows(userId, tankIds, {version:monitoringVersion});
 latestRows.sensors.forEach(row => { latestSensorByTank[String(row.tank_id)] = row; });
 latestRows.scans.forEach(row => { latestAmmoniaByTank[String(row.tank_id)] = row; });
      const mappedTanks = tankList.map(tank => {
        const tankId = getTankId(tank);
        const key = String(tankId);
        const latestSensor = latestSensorByTank[key] || null;
        const latestAmmonia = latestAmmoniaByTank[key] || null;
        return {
          ...tank,
          monitoring_version: monitoringVersion,
        monitoring_thresholds: thresholdsByTank[String(tankId)],
          has_paired_device: pairedIds.has(String(tankId)),
          latest_sensor: latestSensor,
          latest_ammonia: latestAmmonia,
          latest_reading: buildCombinedReading(latestSensor, latestAmmonia)
        };
      });
      if(!loadGuard.current.active || loadGeneration!==loadGuard.current.generation)return;
    setTanks(current=>mappedTanks.map(tank => mergeMonitoringTank(current.find(item => String(item.id)===String(tank.id)),tank)));
      if (mappedTanks.length > 0) {
        setSelectedTankId(current => mappedTanks.some(item => String(getTankId(item)) === String(current)) ? current : getTankId(mappedTanks[0]));
      } else {
        setSelectedTankId(null);
      }
    } catch (_error) {
      console.log("AI GUIDE LOAD ERROR:");
      setMessage("Something went wrong while loading AI and guide data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []));
  useEffect(()=>{const guard=loadGuard.current;guard.active=true;void loadGuideData(true);return()=>{guard.active=false;guard.generation++;};},[loadGuideData]);
  async function handleRefresh() {
    setRefreshing(true);
    await loadGuideData(false);
  }
  function selectTank(tankId) {
    setSelectedTankId(tankId);
    setInputText("");
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd?.({
        animated: false
      });
    }, 120);
  }
  async function handleSendAi(promptOverride = "") {
    const question = String(promptOverride || inputText).trim();
    if (!question || sendLock.current || sendingAi || !selectedTank) {
      return;
    }
    if (question.length > 2000) {
      showNotice("Question too long", "Please keep your question under 2,000 characters.");
      return;
    }
    sendLock.current = true;
    const tankId = String(getTankId(selectedTank));
    const previousMessages = chatByTank[tankId] || [];
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: question,
      createdAt: getServerNow()?.toISOString() || null
    };
    setChatByTank(previous => ({
      ...previous,
      [tankId]: [...(previous[tankId] || []), userMessage]
    }));
    setInputText("");
    setSendingAi(true);
    scrollChatToBottom();
    try {
      const context = await buildAiTankContext({
        tank: selectedTank,
        thresholds,
        ruleBasedResult: ruleResult
      });
      const response = await askCrayThriveAi({
        question,
        context,
        history: previousMessages
      });
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: response?.answer || response?.message || "No AI response was returned.",
        scope: response?.scope || "allowed",
        category: response?.category || "craythrive",
        action: response?.action || "recommendation_only",
        reason: response?.reason || "",
        source: response?.source || 'ai',
        thresholdSuggestion: response?.threshold_suggestion || response?.thresholdSuggestion || null,
        applied: false,
        createdAt: getServerNow()?.toISOString() || null
      };
      setChatByTank(previous => ({
        ...previous,
        [tankId]: [...(previous[tankId] || []), assistantMessage]
      }));
    } catch (error) {
      console.log("ASK AI ERROR:");
      const errorMessage = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        error: true,
        retryQuestion: question,
        action: "warning",
        text: getAiFailureMessage(error),
        createdAt: getServerNow()?.toISOString() || null
      };
      setChatByTank(previous => ({
        ...previous,
        [tankId]: [...(previous[tankId] || []), errorMessage]
      }));
    } finally {
      sendLock.current = false;
      setSendingAi(false);
      scrollChatToBottom();
    }
  }
  const handleApplyThreshold = useSingleFlight(async function handleApplyThreshold(messageItem) {
    if (!selectedTankId || !selectedTank || !messageItem?.thresholdSuggestion || messageItem?.applied || appliedSuggestionIds.current.has(messageItem?.id) || applyingSuggestionId || !isValidThresholdSuggestion(messageItem.thresholdSuggestion)) {
      return;
    }
    const suggestion = messageItem.thresholdSuggestion;
    const tankId = String(getTankId(selectedTank));
    const preview = formatThresholdSuggestionPreview(suggestion);
    setApplyingSuggestionId(messageItem.id);
    try {
    const confirmed = await confirmThresholdApply({
      title: "Apply AI Threshold Suggestion?",
      message: `${preview}\n\nThis will update only ${selectedTank.tank_name || 'the selected tank'}. Only the suggested parameter will be changed.`
    });
    if (!confirmed) {
      return;
    }
      if (String(selectedTankRef.current) !== tankId) throw new Error('The selected tank changed. Review the recommendation again.');
      const result = await applyAiThresholdSuggestion({
        suggestion,
        tankId,
        currentThresholds: thresholds
      });
      const nextThresholds = normalizeThresholds(result?.thresholds || result || thresholds);
      appliedSuggestionIds.current.add(messageItem.id);
      setTanks(previous => previous.map(tank => String(getTankId(tank)) === tankId
        ? { ...tank, monitoring_thresholds: nextThresholds } : tank));
      setChatByTank(previous => ({
        ...previous,
        [tankId]: (previous[tankId] || []).map(item => item.id === messageItem.id ? {
          ...item,
          applied: true,
          appliedAt: getServerNow()?.toISOString() || null
        } : item)
      }));
      showNotice("Threshold updated", "The AI recommendation was accepted for this tank. Other tanks were not changed.");
    } catch (_error) {
      console.log("APPLY AI THRESHOLD ERROR:");
      showNotice("Unable to apply suggestion", "Please review the suggestion and try again.");
    } finally {
      setApplyingSuggestionId(null);
    }
  });
  function clearSelectedChat() {
    if (!selectedTankId) {
      return;
    }
    setChatByTank(previous => ({
      ...previous,
      [String(selectedTankId)]: []
    }));
  }
  function scrollChatToBottom() {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd?.({
        animated: true
      });
    }, 120);
  }
  if (selectedLessonKey) {
    return <GuideLessonDetailsScreen lessonKey={selectedLessonKey} onBack={() => setSelectedLessonKey(null)} />;
  }
  return <AppScreen>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.root}>
        {monitoringSync.error ? <Text accessibilityRole="alert" style={{color:colors.muted,fontSize:12,lineHeight:18}}>{monitoringSync.error}</Text> : null}
          {!(keyboardVisible && activeMode === "ask") && <AppHeader eyebrow="Care Support" title="AI & Guide" subtitle="Ask about CrayThrive or crayfish care, review tank checks, or open the beginner guide." icon="sparkles-outline" rightAction="refresh-outline" onRightPress={() => loadGuideData(true)} />}

          {!(keyboardVisible && activeMode === "ask") && <ModeSelector activeMode={activeMode} onChange={setActiveMode} colors={colors} styles={styles} />}

          {activeMode === "ask" ? <AiChatMode keyboardVisible={keyboardVisible} loading={loading} message={message} tanks={tanks} selectedTank={selectedTank} selectedTankId={selectedTankId} onSelectTank={selectTank} messages={selectedMessages} inputText={inputText} setInputText={setInputText} sending={sendingAi} applyingSuggestionId={applyingSuggestionId} onSend={handleSendAi} onApplyThreshold={handleApplyThreshold} onClear={clearSelectedChat} scrollRef={chatScrollRef} ruleResult={ruleResult} colors={colors} styles={styles} /> : <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent2} colors={[colors.accent2]} />} contentContainerStyle={styles.scroll}>
              {activeMode === "check" ? <TankCheck loading={loading} message={message} tanks={tanks} selectedTank={selectedTank} selectedTankId={selectedTankId} onSelectTank={selectTank} thresholds={thresholds} onRefresh={() => loadGuideData(true)} colors={colors} styles={styles} /> : <BeginnerGuide onOpenLesson={setSelectedLessonKey} colors={colors} styles={styles} />}
            </ScrollView>}
        </View>
      </KeyboardAvoidingView>
    </AppScreen>;
}

function ModeSelector({
  activeMode,
  onChange,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.segment
      }
    >
      {MODES.map(
        (item) => {
          const active =
            activeMode ===
            item.key;

          return (
            <TouchableOpacity
              key={
                item.key
              }
              activeOpacity={
                0.85
              }
              style={[
                styles.segmentButton,

                active &&
                  styles.segmentActive,
              ]}
              onPress={() =>
                onChange(
                  item.key
                )
              }
            >
              <Ionicons
                name={
                  item.icon
                }
                size={
                  15
                }
                color={
                  active
                    ? "#062C2B"
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
            </TouchableOpacity>
          );
        }
      )}
    </View>
  );
}

function AiChatMode({ keyboardVisible,
  loading,
  message,
  tanks,
  selectedTank,
  selectedTankId,
  onSelectTank,
  messages,
  inputText,
  setInputText,
  sending,
  applyingSuggestionId,
  onSend,
  onApplyThreshold,
  onClear,
  scrollRef,
  ruleResult,
  colors,
  styles
}) {
  if (loading) {
    return <StateCard loading title="Preparing assistant" text="Loading your tank context from Supabase." colors={colors} styles={styles} />;
  }
  if (message) {
    return <StateCard icon="alert-circle-outline" iconColor={colors.warning} title="Tank data unavailable" text={message} colors={colors} styles={styles} />;
  }
  if (tanks.length === 0) {
    return <StateCard customIcon={<CrayfishIcon size={43} color={colors.accent2} />} title="No tank to discuss" text="Add a tank first. CrayThrive AI uses a selected tank as context for tank-specific questions." colors={colors} styles={styles} />;
  }
  const reading = selectedTank?.latest_reading || null;
  return <View style={[styles.chatRoot, { paddingBottom: keyboardVisible ? 8 : 104 }]}>
      

      

      

      {!keyboardVisible && <TankSelector tanks={tanks} selectedTankId={selectedTankId} onSelect={onSelectTank} colors={colors} styles={styles} />}
<ScrollView ref={scrollRef} style={styles.chatMessages} contentContainerStyle={styles.chatMessagesContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollRef.current?.scrollToEnd?.({
      animated: true
    })}>
<TankContextCard tank={selectedTank} reading={reading} ruleResult={ruleResult} colors={colors} styles={styles} />
<View style={styles.chatHeader}>
        <View>
          <Text style={styles.chatHeaderTitle}>
            Ask CrayThrive AI
          </Text>

          <Text style={styles.chatHeaderText}>
            Crayfish, tank care, sensors, thresholds, alerts, feeding, and system questions only.
          </Text>
        </View>

        {messages.length > 0 ? <TouchableOpacity activeOpacity={0.85} onPress={onClear}>
            <Text style={styles.clearText}>
              Clear
            </Text>
          </TouchableOpacity> : null}
      </View>
        {messages.length === 0 ? <AssistantIntro tank={selectedTank} colors={colors} styles={styles} /> : messages.map(item => <ChatBubble onRetry={() => onSend(item.retryQuestion)} retrying={sending} key={item.id} item={item} applying={applyingSuggestionId === item.id} applyDisabled={Boolean(applyingSuggestionId)} onApplyThreshold={() => onApplyThreshold(item)} colors={colors} styles={styles} />)}

        {sending ? <TypingBubble colors={colors} styles={styles} /> : null}
      </ScrollView>

      <ScrollView style={{ flexGrow: 0, maxHeight: 62 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPromptRow} keyboardShouldPersistTaps="handled">
        <TouchableOpacity activeOpacity={0.84} style={styles.quickPrompt} onPress={() => onSend(THRESHOLD_PREVIEW_QUESTION)} disabled={sending} accessibilityLabel="Preview threshold change" accessibilityHint="Ask which parameter and values to preview before applying a saved change">
          <Text style={styles.quickPromptText} numberOfLines={1}>Preview threshold change</Text>
        </TouchableOpacity>
        {QUICK_PROMPTS.map(prompt => <TouchableOpacity key={prompt} activeOpacity={0.84} style={styles.quickPrompt} onPress={() => onSend(prompt)} disabled={sending}>
              <Text style={styles.quickPromptText} numberOfLines={1}>
                {prompt}
              </Text>
            </TouchableOpacity>)}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.composerInputWrap}>
          <TextInput value={inputText} onChangeText={setInputText} placeholder={`Ask about ${selectedTank?.tank_name || "this tank"}...`} placeholderTextColor={colors.inputPlaceholder} style={styles.composerInput} multiline maxLength={2000} editable={!sending} textAlignVertical="center" />
        </View>

        <TouchableOpacity activeOpacity={0.84} style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]} disabled={!inputText.trim() || sending} onPress={() => onSend()}>
          {sending ? <ActivityIndicator size="small" color="#062C2B" /> : <Ionicons name="arrow-up" size={20} color="#062C2B" />}
        </TouchableOpacity>
      </View>

      {!keyboardVisible && <Text style={styles.aiDisclaimer}>
        AI provides CrayThrive and crayfish-related guidance only. It does not directly operate pumps or feeders. Threshold changes require your confirmation.
      </Text>}
    </View>;
}

function AssistantIntro({
  tank,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.aiIntro
      }
    >
      <View
        style={
          styles.aiAvatar
        }
      >
        <Ionicons
          name="sparkles-outline"
          size={
            21
          }
          color={
            colors.accent2
          }
        />
      </View>

      <View
        style={
          styles.aiIntroBubble
        }
      >
        <Text
          style={
            styles.aiIntroTitle
          }
        >
          CrayThrive AI
        </Text>

        <Text
          style={
            styles.aiIntroText
          }
        >
          I can help explain saved readings for{" "}
          {tank
            ?.tank_name ||
          "this tank"},
          discuss crayfish care, feeding, water quality, alerts, and threshold settings. I will decline unrelated questions. You can ask in English or Filipino.
        </Text>
      </View>
    </View>
  );
}

function ChatBubble({
  applyDisabled,
  item,
  onRetry,
  retrying,
  applying,
  onApplyThreshold,
  colors,
  styles
}) {
  const mine = item.role === "user";
  const showThresholdCard = !mine && item.action === "suggest_threshold_change" && isValidThresholdSuggestion(item.thresholdSuggestion);
  return <View style={[styles.chatBubbleRow, mine && styles.chatBubbleRowMine]}>
      {!mine ? <View style={styles.chatAiIcon}>
          <Ionicons name={item.error ? "alert-circle-outline" : "sparkles-outline"} size={15} color={item.error ? colors.warning : colors.accent2} />
        </View> : null}

      <View style={[styles.chatBubble, mine ? styles.chatBubbleMine : styles.chatBubbleAi, item.error && styles.chatBubbleError]}>
        {!mine ? <View style={styles.aiBubbleHeader}>
            <Text style={[styles.chatSpeaker, item.error && {
          color: colors.warning
        }]}>
              {item.source === 'rule_based' ? 'CrayThrive Rules' : 'CrayThrive AI'}
            </Text>

            {item.action ? <View style={[styles.actionChip, item.action === "warning" && styles.actionChipWarning]}>
                <Text style={[styles.actionChipText, item.action === "warning" && {
            color: colors.warning
          }]}>
                  {ACTION_LABELS[item.action] || "Recommendation"}
                </Text>
              </View> : null}
          </View> : null}

        <Text style={[styles.chatBubbleText, mine && styles.chatBubbleTextMine]}>
          {item.text}
        </Text>

        {!mine && item.reason ? <Text style={styles.aiReason}>
            {item.reason}
          </Text> : null}

        {item.error && item.retryQuestion ? <TouchableOpacity onPress={onRetry} disabled={retrying} accessibilityRole="button" accessibilityLabel="Retry your AI question" style={{
        minHeight: 44,
        justifyContent: "center",
        opacity: retrying ? 0.5 : 1
      }}><Text style={{
          color: colors.accent2,
          fontWeight: "700"
        }}>Try again</Text></TouchableOpacity> : null}
{showThresholdCard ? <ThresholdSuggestionCard suggestion={item.thresholdSuggestion} applied={item.applied} applying={applying} disabled={applyDisabled} onApply={onApplyThreshold} colors={colors} styles={styles} /> : null}

        <Text style={[styles.chatTime, mine && styles.chatTimeMine]}>
          {formatMessageTime(item.createdAt)}
        </Text>
      </View>
    </View>;
}

function ThresholdSuggestionCard({
  disabled,
  suggestion,
  applied,
  applying,
  onApply,
  colors,
  styles,
}) {
  const display =
    getThresholdSuggestionDisplay(
      suggestion
    );

  return (
    <View
      style={
        styles.thresholdSuggestionCard
      }
    >
      <View
        style={
          styles.thresholdSuggestionHeader
        }
      >
        <View
          style={
            styles.thresholdSuggestionIcon
          }
        >
          <Ionicons
            name="options-outline"
            size={
              17
            }
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={{
            flex:
              1,
          }}
        >
          <Text
            style={
              styles.thresholdSuggestionTitle
            }
          >
            {
              display.title
            }
          </Text>

          <Text
            style={
              styles.thresholdSuggestionSub
            }
          >
            AI suggested adjustment
          </Text>
        </View>
      </View>

      <View
        style={
          styles.thresholdCompareRow
        }
      >
        <View
          style={
            styles.thresholdCompareBox
          }
        >
          <Text
            style={
              styles.thresholdCompareLabel
            }
          >
            Current
          </Text>

          <Text
            style={
              styles.thresholdCompareValue
            }
          >
            {
              display.current
            }
          </Text>
        </View>

        <Ionicons
          name="arrow-forward"
          size={
            16
          }
          color={
            colors.muted2
          }
        />

        <View
          style={
            styles.thresholdCompareBox
          }
        >
          <Text
            style={
              styles.thresholdCompareLabel
            }
          >
            Suggested
          </Text>

          <Text
            style={[
              styles.thresholdCompareValue,

              {
                color:
                  colors.accent2,
              },
            ]}
          >
            {
              display.suggested
            }
          </Text>
        </View>
      </View>

      {suggestion
        ?.reason ? (
        <Text
          style={
            styles.thresholdReason
          }
        >
          {
            suggestion.reason
          }
        </Text>
      ) : null}

      {applied ? (
        <View
          style={
            styles.appliedBanner
          }
        >
          <Ionicons
            name="checkmark-circle"
            size={
              16
            }
            color={
              colors.success
            }
          />

          <Text
            style={
              styles.appliedBannerText
            }
          >
            Threshold Applied
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={
            0.85
          }
          style={[
            styles.thresholdApplyButton,

            (applying || disabled) &&
              styles.thresholdApplyButtonDisabled,
          ]}
          onPress={
            onApply
          }
          disabled={applying || disabled}
        >
          {applying ? (
            <ActivityIndicator
              size="small"
              color="#062C2B"
            />
          ) : (
            <Ionicons
              name="checkmark-outline"
              size={
                16
              }
              color="#062C2B"
            />
          )}

          <Text
            style={
              styles.thresholdApplyButtonText
            }
          >
            {applying
              ? "Applying..."
              : "Apply Threshold"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function TypingBubble({
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.chatBubbleRow
      }
    >
      <View
        style={
          styles.chatAiIcon
        }
      >
        <Ionicons
          name="sparkles-outline"
          size={
            15
          }
          color={
            colors.accent2
          }
        />
      </View>

      <View
        style={[
          styles.chatBubble,
          styles.chatBubbleAi,
          styles.typingBubble,
        ]}
      >
        <ActivityIndicator
          size="small"
          color={
            colors.accent2
          }
        />

        <Text
          style={
            styles.typingText
          }
        >
          Checking CrayThrive context...
        </Text>
      </View>
    </View>
  );
}

function TankSelector({
  tanks,
  selectedTankId,
  onSelect,
  colors,
  styles,
}) {
  return (
    <View>
      <View
        style={
          styles.selectorHeader
        }
      >
        <Text
          style={
            styles.selectorTitle
          }
        >
          Selected Tank
        </Text>

        <Text
          style={
            styles.selectorCount
          }
        >
          {tanks.length}{" "}
          {tanks.length ===
          1
            ? "tank"
            : "tanks"}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.tankSelectorRow
        }
      >
        {tanks.map(
          (tank) => {
            const tankId =
              getTankId(
                tank
              );

            const active =
              String(
                selectedTankId
              ) ===
              String(
                tankId
              );

            return (
              <TouchableOpacity
                key={
                  tankId
                }
                activeOpacity={
                  0.85
                }
                style={[
                  styles.tankChip,

                  active &&
                    styles.tankChipActive,
                ]}
                onPress={() =>
                  onSelect(
                    tankId
                  )
                }
              >
                <CrayfishIcon
                  size={
                    20
                  }
                  color={
                    active
                      ? "#062C2B"
                      : colors.accent2
                  }
                />

                <View
                  style={
                    styles.tankChipContent
                  }
                >
                  <Text
                    style={[
                      styles.tankChipTitle,

                      active &&
                        styles.tankChipTitleActive,
                    ]}
                    numberOfLines={
                      1
                    }
                  >
                    {tank
                      .tank_name ||
                      "Tank"}
                  </Text>

                  <Text
                    style={[
                      styles.tankChipText,

                      active &&
                        styles.tankChipTextActive,
                    ]}
                    numberOfLines={
                      1
                    }
                  >
                    {getLatestSourceLabel(
                      tank
                    )}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }
        )}
      </ScrollView>
    </View>
  );
}

function TankContextCard({
  tank,
  reading,
  ruleResult,
  colors,
  styles,
}) {
  const ammonia = ruleResult.metrics.ammonia;
  return (
    <AppCard
      strong
      style={
        styles.contextCard
      }
    >
      <View
        style={
          styles.contextTop
        }
      >
        <View
          style={
            styles.contextIcon
          }
        >
          <Ionicons
            name="analytics-outline"
            size={
              20
            }
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.flexOne
          }
        >
          <Text
            style={
              styles.contextName
            }
            numberOfLines={
              1
            }
          >
            {tank
              ?.tank_name ||
              "Selected Tank"}
          </Text>

          <Text
            style={
              styles.contextSub
            }
            numberOfLines={
              1
            }
          >
            {formatTankPopulation(
              tank || {}
            )}
          </Text>
        </View>

        <ContextStatus
          result={
            ruleResult
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
          styles.contextGrid
        }
      >
        <ContextMetric
          label="Temp"
          metric={ruleResult.metrics.temperature}
          colors={colors}
          value={formatValue(
            reading
              ?.temperature,
            "°C"
          )}
          styles={
            styles
          }
        />

        <ContextMetric
          label="pH"
          metric={ruleResult.metrics.ph}
          colors={colors}
          value={formatValue(
            reading?.ph
          )}
          styles={
            styles
          }
        />

        <ContextMetric
          label="Ammonia (manual scan)"
          metric={ammonia}
          colors={colors}
          value={reading?.ammonia == null ? (reading?.has_ammonia_scan ? 'No Reading' : 'No Scan') : formatValue(
            reading
              ?.ammonia,
            " ppm"
          )}
          styles={
            styles
          }
        />

        <ContextMetric
          label="Water reading"
          value={formatShortDate(
            reading
              ?.created_at
          )}
          styles={
            styles
          }
        />
      </View>
      <Text style={{ color: monitoringColor(ammonia.tone, colors), fontSize: 12, lineHeight: 18, marginTop: 8 }}>
        Ammonia: {ammonia.label}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
        {reading?.has_ammonia_scan ? formatAmmoniaTimestamp(reading.ammonia_created_at) : 'Ammonia: No Scan'}
      </Text>
    </AppCard>
  );
}

function ContextMetric({
  label,
  value,
  metric,
  colors,
  styles,
}) {
  return (
    <View
      style={
        styles.contextMetric
      }
    >
      <Text
        style={
          styles.contextMetricLabel
        }
      >
        {
          label
        }
      </Text>

      <Text
        style={
          styles.contextMetricValue
        }
        numberOfLines={
          1
        }
      >
        {
          metric?.severity === 'missing' ? metric.label : value
        }
      </Text>
      {metric ? <><SensorSafeRange metric={metric} colors={colors} /><MonitoringBadge result={metric} colors={colors} /></> : null}
    </View>
  );
}

function ContextStatus({ result, colors }) { return <MonitoringBadge result={result} colors={colors} />; }

function TankCheck({
  loading,
  message,
  tanks,
  selectedTank,
  selectedTankId,
  onSelectTank,
  thresholds,
  onRefresh,
  colors,
  styles,
}) {
  const reading =
    selectedTank
      ?.latest_reading ||
    null;

  const hasData =
    Boolean(
      reading
    );

  const result =
    useMemo(() => {
      return analyzeTankReading(
        reading,
        hasData,
        thresholds, { paired: Boolean(selectedTank?.has_paired_device) }
      );
    }, [
      reading,
      hasData,
      thresholds,
    , selectedTank?.has_paired_device]);

  const actions =
    useMemo(() => {
      return buildRecommendedActions(
        result,
        selectedTank,
        hasData
      );
    }, [
      result,
      selectedTank,
      hasData,
    ]);

  if (loading) {
    return (
      <StateCard
        loading
        title="Loading tank check"
        text="Reviewing your latest saved tank records."
        colors={
          colors
        }
        styles={
          styles
        }
      />
    );
  }

  if (message) {
    return (
      <StateCard
        icon="alert-circle-outline"
        iconColor={
          colors.warning
        }
        title="Unable to load data"
        text={
          message
        }
        action="Try Again"
        onPress={
          onRefresh
        }
        colors={
          colors
        }
        styles={
          styles
        }
      />
    );
  }

  if (
    tanks.length ===
    0
  ) {
    return (
      <StateCard
        customIcon={
          <CrayfishIcon
            size={
              44
            }
            color={
              colors.accent2
            }
          />
        }
        title="No tanks yet"
        text="Add a tank first. Tank Check uses saved sensor and ammonia records."
        colors={
          colors
        }
        styles={
          styles
        }
      />
    );
  }

  return (
    <View>
      <TankSelector
        tanks={
          tanks
        }
        selectedTankId={
          selectedTankId
        }
        onSelect={
          onSelectTank
        }
        colors={
          colors
        }
        styles={
          styles
        }
      />

      <AppCard
        strong
        style={
          styles.analysisHero
        }
      >
        <View
          style={
            styles.flexOne
          }
        >
          <View
            style={
              styles.analysisTop
            }
          >
            <Text
              style={
                styles.analysisLabel
              }
            >
              Rule-based tank check
            </Text>

            <ContextStatus
              result={
                result
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
              styles.analysisScore
            }
          >
            {result.score !== null
              ? `${result.score}%`
              : "—"}
          </Text>

          <Text
            style={
              styles.analysisMessage
            }
          >
            {hasData
              ? result.message
              : "No sensor or ammonia record is available for this tank yet."}
          </Text>

          <Text
            style={
              styles.analysisSuggestion
            }
          >
            {hasData
              ? result.suggestion
              : "Wait for a saved sensor reading, perform an ammonia test, or inspect the tank manually."}
          </Text>
        </View>
      </AppCard>

      <SectionHeader
        title="Latest Saved Readings"
        action={getLatestSourceLabel(
          selectedTank
        )}
      />

      <View
        style={
          styles.sensorGrid
        }
      >
        <SensorReadingCard metric={evaluateMonitoring(reading, thresholds, { paired: Boolean(selectedTank?.has_paired_device) }).metrics.temperature} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(reading, thresholds, { paired: Boolean(selectedTank?.has_paired_device) }).metrics.ph} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(reading, thresholds, { paired: Boolean(selectedTank?.has_paired_device) }).metrics.turbidity} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(reading, thresholds, { paired: Boolean(selectedTank?.has_paired_device) }).metrics.ammonia} colors={colors} />

        <SensorReadingCard metric={evaluateMonitoring(reading, thresholds, { paired: Boolean(selectedTank?.has_paired_device) }).metrics.water} colors={colors} />

        <MiniSensor
          icon="time-outline"
          label="Last Water Reading"
          value={formatShortDate(
            reading
              ?.created_at
          )}
          state={
            reading?.sensor_created_at
              ? "Saved record"
              : "No data"
          }
          colors={
            colors
          }
          styles={
            styles
          }
        />
      </View>

      <SectionHeader
        title="Recommended Actions"
        action={`${actions.length} ${
          actions.length ===
          1
            ? "item"
            : "items"
        }`}
      />

      <View
        style={
          styles.actionList
        }
      >
        {actions.map(
          (
            item,
            index
          ) => (
            <ActionAdvice
              key={`${item.title}-${index}`}
              item={
                item
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

      <View
        style={
          styles.explainCard
        }
      >
        <View
          style={
            styles.explainIcon
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={
              20
            }
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.flexOne
          }
        >
          <Text
            style={
              styles.explainTitle
            }
          >
            Rule-based support
          </Text>

          <Text
            style={
              styles.explainText
            }
          >
            Tank Check uses the latest available readings and current CrayThrive thresholds. This deterministic check is separate from the conversational AI assistant.
          </Text>
        </View>
      </View>
    </View>
  );
}

function BeginnerGuide({
  onOpenLesson,
  colors,
  styles,
}) {
  return (
    <View>
      <View
        style={
          styles.guideHero
        }
      >
        <View
          style={
            styles.guideHeroIcon
          }
        >
          <Ionicons
            name="school-outline"
            size={
              27
            }
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={
            styles.flexOne
          }
        >
          <Text
            style={
              styles.guideHeroTitle
            }
          >
            Beginner&apos;s Guide
          </Text>

          <Text
            style={
              styles.guideHeroText
            }
          >
            Learn crayfish tank care, feeding, water quality, ammonia testing, and common tank problems.
          </Text>
        </View>
      </View>

      <SectionHeader
        title="Learning Topics"
        action={`${GUIDE_LESSONS.length} lessons`}
      />

      <View
        style={
          styles.guideList
        }
      >
        {GUIDE_LESSONS.map(
          (
            lesson
          ) => (
            <GuideLesson
              key={
                lesson.key
              }
              lesson={
                lesson
              }
              onPress={() =>
                onOpenLesson(
                  lesson.key
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
    </View>
  );
}

function StateCard({
  loading = false,
  icon,
  iconColor,
  customIcon,
  title,
  text,
  action,
  onPress,
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
        {loading ? (
          <ActivityIndicator
            color={
              colors.accent2
            }
          />
        ) : customIcon ? (
          customIcon
        ) : (
          <Ionicons
            name={
              icon ||
              "information-circle-outline"
            }
            size={
              30
            }
            color={
              iconColor ||
              colors.accent2
            }
          />
        )}
      </View>

      <Text
        style={
          styles.stateTitle
        }
      >
        {
          title
        }
      </Text>

      <Text
        style={
          styles.stateText
        }
      >
        {
          text
        }
      </Text>

      {action ? (
        <TouchableOpacity
          activeOpacity={
            0.85
          }
          style={
            styles.stateButton
          }
          onPress={
            onPress
          }
        >
          <Ionicons
            name="refresh-outline"
            size={
              15
            }
            color="#062C2B"
          />

          <Text
            style={
              styles.stateButtonText
            }
          >
            {
              action
            }
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MiniSensor({
  icon,
  label,
  value,
  state,
  material = false,
  colors,
  styles,
}) {
  const Icon =
    material
      ? MaterialCommunityIcons
      : Ionicons;

  const tone =
    getStateType(
      state
    );

  return (
    <View
      style={
        styles.sensorCard
      }
    >
      <View
        style={
          styles.sensorTop
        }
      >
        <View
          style={
            styles.sensorIcon
          }
        >
          <Icon
            name={
              icon
            }
            size={
              18
            }
            color={
              colors.accent2
            }
          />
        </View>

        <View
          style={[
            styles.sensorDot,

            {
              backgroundColor:
                tone ===
                "danger"
                  ? colors.danger
                  : tone ===
                    "warning"
                  ? colors.warning
                  : tone ===
                    "neutral"
                  ? colors.muted2
                  : colors.success,
            },
          ]}
        />
      </View>

      <Text
        style={
          styles.sensorLabel
        }
      >
        {
          label
        }
      </Text>

      <Text
        style={
          styles.sensorValue
        }
        numberOfLines={
          2
        }
      >
        {
          value
        }
      </Text>

      <Text
        style={[
          styles.sensorState,

          {
            color:
              tone ===
              "danger"
                ? colors.danger
                : tone ===
                  "warning"
                ? colors.warning
                : tone ===
                  "neutral"
                ? colors.muted2
                : colors.success,
          },
        ]}
      >
        {
          state
        }
      </Text>
    </View>
  );
}

function ActionAdvice({
  item,
  colors,
  styles,
}) {
  const tone =
    item.level ===
      "danger" ||
    item.level ===
      "critical"
      ? "danger"
      : item.level ===
        "warning"
      ? "warning"
      : "success";

  return (
    <View
      style={
        styles.adviceCard
      }
    >
      <View
        style={[
          styles.adviceIcon,

          tone ===
            "warning" &&
            styles.adviceIconWarning,

          tone ===
            "danger" &&
            styles.adviceIconDanger,
        ]}
      >
        <Ionicons
          name={
            item.icon ||
            "bulb-outline"
          }
          size={
            19
          }
          color={
            tone ===
            "danger"
              ? colors.danger
              : tone ===
                "warning"
              ? colors.warning
              : colors.accent2
          }
        />
      </View>

      <View
        style={
          styles.flexOne
        }
      >
        <View
          style={
            styles.adviceTitleRow
          }
        >
          <Text
            style={
              styles.adviceTitle
            }
          >
            {
              item.title
            }
          </Text>

          <View
            style={[
              styles.adviceTone,

              tone ===
                "warning" &&
                styles.adviceToneWarning,

              tone ===
                "danger" &&
                styles.adviceToneDanger,
            ]}
          >
            <Text
              style={[
                styles.adviceToneText,

                tone ===
                  "warning" && {
                  color:
                    colors.warning,
                },

                tone ===
                  "danger" && {
                  color:
                    colors.danger,
                },
              ]}
            >
              {tone ===
              "danger"
                ? "Needs attention"
                : tone ===
                  "warning"
                ? "Review"
                : "Suggested"}
            </Text>
          </View>
        </View>

        <Text
          style={
            styles.adviceText
          }
        >
          {item.text ||
            item.message}
        </Text>
      </View>
    </View>
  );
}

function GuideLesson({
  lesson,
  onPress,
  colors,
  styles,
}) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.85
      }
      style={
        styles.lessonCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={
          styles.lessonIcon
        }
      >
        {lesson.icon ===
        "crayfish" ? (
          <CrayfishIcon
            size={
              22
            }
            color={
              colors.accent2
            }
          />
        ) : (
          <Ionicons
            name={
              lesson.icon
            }
            size={
              20
            }
            color={
              colors.accent2
            }
          />
        )}
      </View>

      <View
        style={
          styles.flexOne
        }
      >
        <Text
          style={
            styles.lessonTitle
          }
        >
          {
            lesson.title
          }
        </Text>

        <Text
          style={
            styles.lessonText
          }
          numberOfLines={
            2
          }
        >
          {
            lesson.summary
          }
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={
          17
        }
        color={
          colors.muted2
        }
      />
    </TouchableOpacity>
  );
}

function buildRecommendedActions(
  result,
  selectedTank,
  hasData
) {
  if (!selectedTank) {
    return [
      {
        level:
          "warning",

        title:
          "Select a tank",

        text:
          "Choose a tank before reviewing recommendations.",

        icon:
          "albums-outline",
      },
    ];
  }

  if (!hasData) {
    return [
      {
        level:
          "warning",

        title:
          "Wait for a saved reading",

        text:
          "No sensor reading has been saved for this tank yet.",

        icon:
          "time-outline",
      },

      {
        level:
          "good",

        title:
          "Check ammonia",

        text:
          "Use the phone camera to check an ammonia test strip or record the result manually.",

        icon:
          "camera-outline",
      },

      {
        level:
          "good",

        title:
          "Inspect the tank",

        text:
          "Observe water clarity, odor, water level, feeding response, and crayfish behavior.",

        icon:
          "eye-outline",
      },
    ];
  }

  if (
    Array.isArray(
      result?.issues
    ) &&
    result.issues
      .length >
    0
  ) {
    return result
      .issues
      .map(
        (
          issue
        ) => ({
          level:
            issue.level ||
            "warning",

          title:
            issue.title,

          text:
            issue.message,

          icon:
            issue.icon,
        })
      );
  }

  return [
    {
      level:
        "good",

      title:
        "Continue monitoring",

      text:
        "Available readings are within acceptable ranges based on the current rule check.",

      icon:
        "checkmark-circle-outline",
    },

    {
      level:
        "good",

      title:
        "Continue routine care",

      text:
        "Observe the crayfish and continue normal tank maintenance while monitoring the next saved readings.",

      icon:
        "eye-outline",
    },
  ];
}

function buildCombinedReading(sensor, ammonia) { return combineMonitoringReadings(sensor, ammonia); }

function getTankId(
  tank
) {
  return (
    tank?.id ||
    tank?.uuid ||
    tank?.tank_id ||
    null
  );
}





function getLatestSourceLabel(
  tank
) {
  if (
    !tank
      ?.latest_reading
  ) {
    return "No saved data";
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



function formatValue(value, suffix = '') { return formatReadingValue(value, suffix.trim()); }

function formatShortDate(
  value
) {
  return formatPhilippineDateTime(value, { year: undefined });
}

function formatMessageTime(
  value
) {
  return formatPhilippineTime(value);
}

function getThresholdSuggestionDisplay(
  suggestion = {}
) {
  const parameter =
    normalizeThresholdParameter(
      suggestion.parameter
    );

  const config =
    getThresholdParameterConfig(
      parameter
    );

  const currentMin =
    firstFinite(
      suggestion.current_min,
      suggestion.current
        ?.min
    );

  const currentMax =
    firstFinite(
      suggestion.current_max,
      suggestion.current
        ?.max
    );

  const currentValue =
    firstFinite(
      suggestion.current_value,
      suggestion.current
        ?.value,

      typeof suggestion.current ===
      "number"
        ? suggestion.current
        : null
    );

  const suggestedMin =
    firstFinite(
      suggestion.suggested_min,
      suggestion.suggested
        ?.min
    );

  const suggestedMax =
    firstFinite(
      suggestion.suggested_max,
      suggestion.suggested
        ?.max
    );

  const suggestedValue =
    firstFinite(
      suggestion.suggested_value,
      suggestion.suggested
        ?.value,

      typeof suggestion.suggested ===
      "number"
        ? suggestion.suggested
        : null
    );

  return {
    title:
      config?.title ||
      "AI Threshold Suggestion",

    current:
      formatThresholdRange(
        currentMin,
        currentMax,
        currentValue,
        config?.unit || ""
      ),

    suggested:
      formatThresholdRange(
        suggestedMin,
        suggestedMax,
        suggestedValue,
        config?.unit || ""
      ),
  };
}

function formatThresholdRange(
  min,
  max,
  value,
  unit = ""
) {
  if (
    Number.isFinite(
      min
    ) &&
    Number.isFinite(
      max
    )
  ) {
    return `${trimNumber(
      min
    )} – ${trimNumber(
      max
    )}${unit}`;
  }

  if (
    Number.isFinite(
      value
    )
  ) {
    return `${trimNumber(
      value
    )}${unit}`;
  }

  return "—";
}

function formatThresholdSuggestionPreview(
  suggestion
) {
  const display =
    getThresholdSuggestionDisplay(
      suggestion
    );

  return (
    `${display.title}\n` +
    `Current: ${display.current}\n` +
    `New: ${display.suggested}`
  );
}

function isValidThresholdSuggestion(
  suggestion
) {
  if (
    !suggestion ||
    typeof suggestion !==
      "object"
  ) {
    return false;
  }

  const parameter =
    normalizeThresholdParameter(
      suggestion.parameter
    );

  const config =
    getThresholdParameterConfig(
      parameter
    );

  if (!config) {
    return false;
  }

  const suggestedMin =
    firstFinite(
      suggestion.suggested_min,
      suggestion.suggested
        ?.min
    );

  const suggestedMax =
    firstFinite(
      suggestion.suggested_max,
      suggestion.suggested
        ?.max
    );

  const suggestedValue =
    firstFinite(
      suggestion.suggested_value,
      suggestion.suggested
        ?.value,

      typeof suggestion.suggested ===
      "number"
        ? suggestion.suggested
        : null
    );

  if (
    config.type ===
    "range"
  ) {
    return (
      suggestedMin !== null &&
      suggestedMax !== null &&
      suggestedMin >=
        config.min &&
      suggestedMax <=
        config.max &&
      suggestedMin <
        suggestedMax
    );
  }

  return (
    suggestedValue !== null &&
    suggestedValue >=
      config.min &&
    suggestedValue <=
      config.max
  );
}

function normalizeThresholdParameter(
  value
) {
  const parameter =
    String(
      value || ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "_"
      )
      .replace(
        /-/g,
        "_"
      );

  if (
    parameter ===
      "temp" ||
    parameter ===
      "water_temperature"
  ) {
    return "temperature";
  }

  if (
    parameter ===
      "ph_level"
  ) {
    return "ph";
  }

  if (
    parameter ===
      "water_clarity" ||
    parameter ===
      "clarity"
  ) {
    return "turbidity";
  }

  if (
    parameter ===
      "water" ||
    parameter ===
      "water_depth"
  ) {
    return "water_level";
  }

  if (
    parameter ===
      "nh3"
  ) {
    return "ammonia";
  }

  return parameter;
}

function getThresholdParameterConfig(
  parameter
) {
  const configs = {
    temperature: {
      title:
        "Temperature",

      type:
        "range",

      min:
        10,

      max:
        40,

      unit:
        " °C",
    },

    ph: {
      title:
        "pH",

      type:
        "range",

      min:
        0,

      max:
        14,

      unit:
        "",
    },

    turbidity: {
      title:
        "Turbidity",

      type:
        "single",

      min:
        0,

      max:
        5,

      unit:
        " V",
    },

    water_level: {
      title:
        "Water Level",

      type:
        "single",

      min:
        0,

      max:
        20,

      unit:
        " cm",
    },

    ammonia: {
      title:
        "Ammonia",

      type:
        "single",

      min:
        0,

      max:
        5,

      unit:
        " ppm",
    },
  };

  return (
    configs[
      parameter
    ] || null
  );
}

function firstFinite(
  ...values
) {
  for (
    const value of
    values
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const number =
      Number(
        value
      );

    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }

  return null;
}

function trimNumber(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return "—";
  }

  return Number.isInteger(
    number
  )
    ? String(
        number
      )
    : number
        .toFixed(
          2
        )
        .replace(
          /0+$/,
          ""
        )
        .replace(
          /\.$/,
          ""
        );
}

async function confirmThresholdApply({
  title,
  message,
}) {
  if (
    Platform.OS ===
    "web"
  ) {
    if (
      typeof window !==
        "undefined" &&
      typeof window.confirm ===
        "function"
    ) {
      return window.confirm(
        `${title}\n\n${message}`
      );
    }

    return false;
  }

  return new Promise(
    (resolve) => {
      Alert.alert(
        title,
        message,
        [
          {
            text:
              "Cancel",

            style:
              "cancel",

            onPress:
              () =>
                resolve(
                  false
                ),
          },

          {
            text:
              "Apply",

            onPress:
              () =>
                resolve(
                  true
                ),
          },
        ]
      );
    }
  );
}

function showNotice(
  title,
  text
) {
  if (
    Platform.OS ===
    "web"
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

function getStateType(status) { return status === 'Normal' ? 'success' : status === 'Warning' ? 'warning' : status === 'Critical' ? 'danger' : 'neutral'; }



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
  sourceColors,
  isDark
) {
  return {
    ...COLORS,
    ...sourceColors,

    surface:
      sourceColors.surface ||
      (
        isDark
          ? COLORS.surface
          : "rgba(255,255,255,0.90)"
      ),

    surfaceStrong:
      sourceColors.surfaceStrong ||
      (
        isDark
          ? COLORS.surfaceStrong
          : "#FFFFFF"
      ),

    surfaceSoft:
      sourceColors.surfaceSoft ||
      (
        isDark
          ? COLORS.surfaceSoft
          : "rgba(8,31,48,0.045)"
      ),

    textStrong:
      sourceColors.textStrong ||
      (
        isDark
          ? COLORS.white
          : "#0F172A"
      ),

    muted:
      sourceColors.muted ||
      (
        isDark
          ? COLORS.muted
          : "rgba(15,23,42,0.68)"
      ),

    muted2:
      sourceColors.muted2 ||
      (
        isDark
          ? COLORS.muted2
          : "rgba(15,23,42,0.46)"
      ),

    border:
      sourceColors.border ||
      (
        isDark
          ? COLORS.border
          : "rgba(15,23,42,0.10)"
      ),

    accent:
      sourceColors.accent ||
      COLORS.accent,

    accent2:
      sourceColors.accent2 ||
      COLORS.accent2,

    accentSoft:
      sourceColors.accentSoft ||
      (
        isDark
          ? COLORS.accentSoft
          : "rgba(34,211,197,0.14)"
      ),

    accentBorder:
      sourceColors.accentBorder ||
      (
        isDark
          ? COLORS.accentBorder
          : "rgba(15,118,110,0.18)"
      ),

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

function makeStyles(
  colors
) {
  return StyleSheet.create({
    keyboard: {
      flex:
        1,
    },

    root: {
      flex:
        1,

      paddingHorizontal:
        22,
    },

    flexOne: {
      flex:
        1,

      minWidth:
        0,
    },

    scroll: {
      paddingBottom:
        135,
    },

    segment: {
      minHeight:
        49,

      padding:
        4,

      borderRadius:
        16,

      flexDirection:
        "row",

      gap:
        4,

      marginBottom:
        13,

      backgroundColor:
        colors.surfaceSoft,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    segmentButton: {
      flex:
        1,

      minHeight:
        44,

      borderRadius:
        12,

      alignItems:
        "center",

      justifyContent:
        "center",

      flexDirection:
        "row",

      gap:
        4,

      paddingHorizontal:
        3,
    },

    segmentActive: { minHeight: 44,
      backgroundColor:
        colors.accent,
    },

    segmentText: {
      color:
        colors.muted,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    segmentTextActive: {
      color:
        "#062C2B",
    },

    selectorHeader: {
      marginBottom:
        8,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",
    },

    selectorTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    selectorCount: {
      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    tankSelectorRow: {
      gap:
        7,

      paddingBottom:
        3,
    },

    tankChip: {
      width:
        154,

      minHeight:
        51,

      paddingHorizontal:
        10,

      paddingVertical:
        8,

      borderRadius:
        15,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        7,

      backgroundColor:
        colors.surfaceSoft,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    tankChipActive: { minHeight: 44,
      backgroundColor:
        colors.accent,

      borderColor:
        colors.accent,
    },

    tankChipContent: {
      flex:
        1,

      minWidth:
        0,
    },

    tankChipTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    tankChipTitleActive: {
      color:
        "#062C2B",
    },

    tankChipText: {
      marginTop:
        2,

      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    tankChipTextActive: {
      color:
        "#062C2B",
    },

    /*
    |--------------------------------------------------------------------------
    | CHAT ROOT
    |--------------------------------------------------------------------------
    |
    | Web bottom navigation is fixed/overlayed.
    | Reserve space below the chat composer so the text field
    | stays above the bottom navigation.
    |
    */

    chatRoot: {
      flex:
        1,

      minHeight:
        0,

      paddingBottom:
        Platform.OS === "web"
          ? 96
          : 0,
    },

    contextCard: {
      marginTop:
        9,

      padding:
        11,

      borderRadius:
        17,

      backgroundColor:
        colors.surfaceStrong,

      borderColor:
        colors.accentBorder,
    },

    contextTop: {
      flexDirection:
        "row",

      alignItems:
        "center",
    },

    contextIcon: {
      width:
        38,

      height:
        38,

      borderRadius:
        12,

      marginRight:
        8,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    contextName: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    contextSub: {
      marginTop:
        2,

      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    contextStatus: {
      minHeight:
        23,

      paddingHorizontal:
        7,

      borderRadius:
        RADIUS.pill,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        4,

      backgroundColor:
        colors.successSoft,

      borderWidth:
        1,

      borderColor:
        "rgba(74,222,128,0.20)",
    },

    contextStatusWarning: {
      backgroundColor:
        colors.warningSoft,

      borderColor:
        "rgba(251,191,36,0.20)",
    },

    contextStatusDanger: {
      backgroundColor:
        colors.dangerSoft,

      borderColor:
        "rgba(248,113,113,0.20)",
    },

    contextStatusDot: {
      width:
        5,

      height:
        5,

      borderRadius:
        3,
    },

    contextStatusText: {
      fontSize:
        12,

      fontWeight:
        "600",
    },

    contextGrid: {
      marginTop:
        9,

      minHeight:
        46,

      borderRadius:
        12,

      flexDirection:
        "row",

      backgroundColor:
        colors.surfaceSoft,
    },

    contextMetric: {
      flex:
        1,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal:
        3,
    },

    contextMetricLabel: {
      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    contextMetricValue: {
      marginTop:
        2,

      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",

      textAlign:
        "center",
    },

    chatHeader: { flexWrap: "wrap",
      marginTop:
        12,

      marginBottom:
        5,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap:
        10,
    },

    chatHeaderTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    chatHeaderText: {
      marginTop:
        1,

      maxWidth:
        300,

      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    clearText: {
      color:
        colors.accent2,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    chatMessages: {
      flex:
        1,

      minHeight:
        0,
    },

    chatMessagesContent: {
      paddingTop:
        6,

      paddingBottom:
        8,
    },

    aiIntro: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      paddingVertical:
        10,
    },

    aiAvatar: {
      width:
        32,

      height:
        32,

      borderRadius:
        11,

      marginRight:
        7,

      backgroundColor:
        colors.accentSoft,

      borderWidth:
        1,

      borderColor:
        colors.accentBorder,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    aiIntroBubble: {
      flex:
        1,

      padding:
        11,

      borderRadius:
        15,

      borderTopLeftRadius:
        5,

      backgroundColor:
        colors.surfaceStrong,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    aiIntroTitle: {
      color:
        colors.accent2,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    aiIntroText: {
      marginTop:
        4,

      color:
        colors.muted,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    chatBubbleRow: {
      flexDirection:
        "row",

      alignItems:
        "flex-end",

      marginVertical:
        4,

      paddingRight:
        35,
    },

    chatBubbleRowMine: {
      justifyContent:
        "flex-end",

      paddingLeft:
        35,

      paddingRight:
        0,
    },

    chatAiIcon: {
      width:
        27,

      height:
        27,

      borderRadius:
        9,

      marginRight:
        6,

      marginBottom:
        2,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    chatBubble: {
      maxWidth:
        "88%",

      paddingHorizontal:
        11,

      paddingVertical:
        9,

      borderRadius:
        15,

      borderWidth:
        1,
    },

    chatBubbleAi: {
      borderTopLeftRadius:
        5,

      backgroundColor:
        colors.surfaceStrong,

      borderColor:
        colors.border,
    },

    chatBubbleMine: {
      borderBottomRightRadius:
        5,

      backgroundColor:
        colors.accent,

      borderColor:
        colors.accent,
    },

    chatBubbleError: {
      backgroundColor:
        colors.warningSoft,

      borderColor:
        "rgba(251,191,36,0.22)",
    },

    aiBubbleHeader: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap:
        8,

      marginBottom:
        4,
    },

    chatSpeaker: {
      color:
        colors.accent2,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    actionChip: {
      paddingHorizontal:
        6,

      paddingVertical:
        3,

      borderRadius:
        RADIUS.pill,

      backgroundColor:
        colors.accentSoft,
    },

    actionChipWarning: {
      backgroundColor:
        colors.warningSoft,
    },

    actionChipText: {
      color:
        colors.accent2,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    aiReason: {
      marginTop:
        7,

      color:
        colors.muted,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    thresholdSuggestionCard: {
      marginTop:
        10,

      padding:
        10,

      borderRadius:
        13,

      backgroundColor:
        colors.surfaceSoft,

      borderWidth:
        1,

      borderColor:
        colors.accentBorder,
    },

    thresholdSuggestionHeader: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        7,
    },

    thresholdSuggestionIcon: {
      width:
        29,

      height:
        29,

      borderRadius:
        9,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    thresholdSuggestionTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    thresholdSuggestionSub: {
      marginTop:
        1,

      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    thresholdCompareRow: {
      marginTop:
        9,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        7,
    },

    thresholdCompareBox: {
      flex:
        1,

      padding:
        8,

      borderRadius:
        10,

      backgroundColor:
        colors.surfaceStrong,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    thresholdCompareLabel: {
      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "500",
    },

    thresholdCompareValue: {
      marginTop:
        2,

      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    thresholdReason: {
      marginTop:
        8,

      color:
        colors.muted,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    thresholdApplyButton: {
      marginTop:
        9,

      minHeight:
        44,

      borderRadius:
        11,

      backgroundColor:
        colors.accent,

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap:
        6,
    },

    thresholdApplyButtonDisabled: { minHeight: 44,
      opacity:
        0.56,
    },

    thresholdApplyButtonText: {
      color:
        "#062C2B",

      fontSize:
        12,

      fontWeight:
        "700",
    },

    appliedBanner: {
      marginTop:
        9,

      minHeight:
        32,

      paddingHorizontal:
        9,

      borderRadius:
        10,

      backgroundColor:
        colors.successSoft,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        6,
    },

    appliedBannerText: {
      color:
        colors.success,

      fontSize:
        12,

      fontWeight:
        "700",
    },

    chatBubbleText: {
      color:
        colors.textStrong,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    chatBubbleTextMine: {
      color:
        "#062C2B",
    },

    chatTime: {
      marginTop:
        5,

      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "400",

      textAlign:
        "right",
    },

    chatTimeMine: {
      color:
        "#062C2B",
    },

    typingBubble: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        7,
    },

    typingText: {
      color:
        colors.muted,

      fontSize:
        12,

      fontWeight:
        "400",
    },

    quickPromptRow: {
      gap:
        6,

      paddingVertical:
        7,
    },

    quickPrompt: {
      maxWidth:
        245,

      minHeight:
        44,

      paddingHorizontal:
        10,

      borderRadius:
        RADIUS.pill,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        colors.surfaceSoft,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    quickPromptText: {
      color:
        colors.muted,

      fontSize:
        12,

      fontWeight:
        "500",
    },

    composer: {
      paddingTop:
        5,

      flexDirection:
        "row",

      alignItems:
        "flex-end",

      gap:
        7,
    },

    composerInputWrap: {
      flex:
        1,

      minHeight:
        46,

      maxHeight:
        100,

      borderRadius:
        15,

      paddingHorizontal:
        11,

      paddingVertical:
        7,

      backgroundColor:
        colors.surfaceStrong,

      borderWidth:
        1,

      borderColor:
        colors.border,

      justifyContent:
        "center",
    },

    composerInput: {
      maxHeight:
        82,

      padding:
        0,

      color:
        colors.textStrong,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    sendButton: {
      width:
        46,

      height:
        46,

      borderRadius:
        15,

      backgroundColor:
        colors.accent,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    sendButtonDisabled: { minHeight: 44,
      opacity:
        0.4,
    },

    aiDisclaimer: {
      paddingTop:
        5,

      paddingBottom:
        9,

      color:
        colors.muted2,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",

      textAlign:
        "center",
    },

    analysisHero: {
      marginTop:
        10,

      padding:
        14,

      borderRadius:
        19,

      backgroundColor:
        colors.surfaceStrong,

      borderColor:
        colors.accentBorder,

      ...SHADOW.soft,
    },

    analysisTop: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap:
        8,
    },

    analysisLabel: {
      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "600",

      textTransform:
        "uppercase",

      letterSpacing:
        0.5,
    },

    analysisScore: {
      marginTop:
        9,

      color:
        colors.textStrong,

      fontSize:
        29,

      lineHeight:
        38,

      fontWeight:
        "800",
    },

    analysisMessage: {
      marginTop:
        5,

      color:
        colors.textStrong,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "600",
    },

    analysisSuggestion: {
      marginTop:
        4,

      color:
        colors.muted,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",
    },

    sensorGrid: {
      flexDirection:
        "row",

      flexWrap:
        "wrap",

      gap:
        8,
    },

    sensorCard: {
      width:
        "48%",

      minHeight:
        116,

      padding:
        11,

      borderRadius:
        16,

      backgroundColor:
        colors.surface,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    sensorTop: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      marginBottom:
        8,
    },

    sensorIcon: {
      width:
        33,

      height:
        33,

      borderRadius:
        11,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    sensorDot: {
      width:
        6,

      height:
        6,

      borderRadius:
        3,
    },

    sensorLabel: {
      color:
        colors.muted2,

      fontSize:
        12,

      fontWeight:
        "500",
    },

    sensorValue: {
      marginTop:
        3,

      color:
        colors.textStrong,

      fontSize:
        14,

      lineHeight:
        19,

      fontWeight:
        "700",
    },

    sensorState: {
      marginTop:
        3,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "600",
    },

    actionList: {
      gap:
        8,
    },

    adviceCard: {
      padding:
        11,

      borderRadius:
        16,

      backgroundColor:
        colors.surface,

      borderWidth:
        1,

      borderColor:
        colors.border,

      flexDirection:
        "row",

      alignItems:
        "flex-start",
    },

    adviceIcon: {
      width:
        38,

      height:
        38,

      borderRadius:
        12,

      marginRight:
        9,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    adviceIconWarning: {
      backgroundColor:
        colors.warningSoft,
    },

    adviceIconDanger: {
      backgroundColor:
        colors.dangerSoft,
    },

    adviceTitleRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        6,
    },

    adviceTitle: {
      flex:
        1,

      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    adviceText: {
      marginTop:
        4,

      color:
        colors.muted,

      fontSize:
        14,

      lineHeight:
        20,

      fontWeight:
        "400",
    },

    adviceTone: {
      minHeight:
        21,

      paddingHorizontal:
        6,

      borderRadius:
        RADIUS.pill,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    adviceToneWarning: {
      backgroundColor:
        colors.warningSoft,
    },

    adviceToneDanger: {
      backgroundColor:
        colors.dangerSoft,
    },

    adviceToneText: {
      color:
        colors.accent2,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    explainCard: {
      marginTop:
        13,

      padding:
        11,

      borderRadius:
        15,

      backgroundColor:
        colors.accentSoft,

      borderWidth:
        1,

      borderColor:
        colors.accentBorder,

      flexDirection:
        "row",

      alignItems:
        "flex-start",
    },

    explainIcon: {
      width:
        34,

      height:
        34,

      borderRadius:
        11,

      backgroundColor:
        colors.surfaceSoft,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginRight:
        8,
    },

    explainTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    explainText: {
      marginTop:
        3,

      color:
        colors.muted,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",
    },

    guideHero: {
      padding:
        13,

      borderRadius:
        18,

      backgroundColor:
        colors.accentSoft,

      borderWidth:
        1,

      borderColor:
        colors.accentBorder,

      flexDirection:
        "row",

      alignItems:
        "center",
    },

    guideHeroIcon: {
      width:
        49,

      height:
        49,

      borderRadius:
        16,

      marginRight:
        10,

      backgroundColor:
        colors.surfaceSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    guideHeroTitle: {
      color:
        colors.textStrong,

      fontSize:
        13.5,

      fontWeight:
        "700",
    },

    guideHeroText: {
      marginTop:
        3,

      color:
        colors.muted,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",
    },

    guideList: {
      gap:
        8,
    },

    lessonCard: {
      minHeight:
        70,

      padding:
        11,

      borderRadius:
        16,

      flexDirection:
        "row",

      alignItems:
        "center",

      backgroundColor:
        colors.surface,

      borderWidth:
        1,

      borderColor:
        colors.border,
    },

    lessonIcon: {
      width:
        40,

      height:
        40,

      borderRadius:
        13,

      marginRight:
        9,

      backgroundColor:
        colors.accentSoft,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    lessonTitle: {
      color:
        colors.textStrong,

      fontSize:
        12,

      fontWeight:
        "600",
    },

    lessonText: {
      marginTop:
        3,

      color:
        colors.muted,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",
    },

    stateCard: {
      flex:
        1,

      minHeight:
        230,

      borderRadius:
        19,

      padding:
        21,

      backgroundColor:
        colors.surface,

      borderWidth:
        1,

      borderColor:
        colors.border,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    stateIcon: {
      width:
        58,

      height:
        58,

      borderRadius:
        19,

      backgroundColor:
        colors.accentSoft,

      borderWidth:
        1,

      borderColor:
        colors.accentBorder,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    stateTitle: {
      marginTop:
        11,

      color:
        colors.textStrong,

      fontSize:
        13.5,

      fontWeight:
        "700",

      textAlign:
        "center",
    },

    stateText: {
      marginTop:
        5,

      maxWidth:
        290,

      color:
        colors.muted,

      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        "400",

      textAlign:
        "center",
    },

    stateButton: {
      marginTop:
        13,

      minHeight:
        44,

      paddingHorizontal:
        12,

      borderRadius:
        RADIUS.pill,

      backgroundColor:
        colors.accent,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        5,
    },

    stateButtonText: {
      color:
        "#062C2B",

      fontSize:
        12,

      fontWeight:
        "600",
    },
  });
}
