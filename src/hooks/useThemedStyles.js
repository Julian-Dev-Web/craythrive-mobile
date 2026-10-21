import { useMemo } from 'react';
import { useAppTheme } from '../context/ThemeContext';

export default function useThemedStyles(makeStyles) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors, makeStyles]);
  return { colors, styles, isDark };
}
