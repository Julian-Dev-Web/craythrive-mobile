import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export default function useAndroidBack(onBack, blocked = false) {
  const callback = useRef(onBack);
  const busy = useRef(blocked);
  callback.current = onBack;
  busy.current = blocked;
  const enabled = typeof onBack === 'function';
  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy.current) callback.current?.();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}
