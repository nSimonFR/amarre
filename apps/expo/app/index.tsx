import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.root}>
      <View style={styles.dot} />
      <Text style={styles.title}>hello, amarre</Text>
      <Text style={styles.subtitle}>Expo · web · iOS · Android</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "#f6f5f1",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#7c5cff",
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#0c0c0e",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b6b6b",
    letterSpacing: 0.5,
  },
});
