import { parseDurationToSeconds } from "./src/lib/stopProfiler.js";

const testDurations = [
  "00:15:30",
  "1h 30m 10s",
  "45m",
  "1d 2h",
  "1 days 05:00:00"
];

for (const d of testDurations) {
  console.log(`Duration '${d}' -> ${parseDurationToSeconds(d)} seconds`);
}
