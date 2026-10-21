import useMonitoringSync from './useMonitoringSync';

export default function useTankRecommendationData(tankId) {
  const state=useMonitoringSync([tankId]),snapshot=state.snapshot;
  return {...state,tankId,sensor:snapshot?.sensors.find(row=>String(row.tank_id)===String(tankId)) || null,
    scan:snapshot?.scans.find(row=>String(row.tank_id)===String(tankId)) || null,
    thresholds:snapshot?.thresholds[String(tankId)],paired:snapshot?.paired.has(String(tankId)) || false,
    serverTime:snapshot?.serverTime};
}
