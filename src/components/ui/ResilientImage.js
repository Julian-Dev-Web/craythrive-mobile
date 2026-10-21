import { useEffect, useState } from "react";
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';

export default function ResilientImage({ source, fallback, onError, style, ...props }) {
  const { colors } = useAppTheme();
  const uri = source?.uri || '';
  const [failedUri, setFailedUri] = useState(null);
  useEffect(() => { setFailedUri(null); }, [uri]);
  if (!uri || failedUri === uri) {
    return fallback || <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft }]}>
      <Ionicons name="image-outline" size={32} color={colors.muted} />
    </View>;
  }
  return <Image {...props} source={source} style={style} resizeMode={props.resizeMode || 'cover'}
    onError={event => { setFailedUri(uri); onError?.(event); }} />;
}
