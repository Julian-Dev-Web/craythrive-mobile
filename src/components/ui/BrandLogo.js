// src/components/ui/BrandLogo.js

import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { COLORS, SHADOW } from "../../constants/theme";

export default function BrandLogo({ size = 140 }) {
  const radius = size / 2;

  return (
    <View
      style={[
        styles.logoWrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      <Image
        source={require("../../../assets/images/Logo.png")}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
        }}
        contentFit="cover"
        transition={250}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    backgroundColor: COLORS.white,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(25,183,166,0.45)",
    ...SHADOW.soft,
  },
});