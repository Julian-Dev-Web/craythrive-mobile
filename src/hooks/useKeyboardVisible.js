import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export default function useKeyboardVisible() {
  const [visible, setVisible] = useState(() => Keyboard.isVisible?.() || false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}
