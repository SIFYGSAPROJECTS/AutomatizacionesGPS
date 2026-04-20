"use client";

import { useEffect } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { History, Database } from "lucide-react";

export function TimelineSlider() {
  const { availableMonths, globalDateRange, setGlobalDateRange, loadDataFromDb, scanAvailableMonths } = useFleetStore();

  useEffect(() => {
    scanAvailableMonths();
  }, []);

  const handleMonthChange = async (monthStr: string) => {
    if (monthStr === "all") {
      if (availableMonths.length === 0) return;
      const first = availableMonths[0];
      const last = availableMonths[availableMonths.length - 1];
      const range = { from: `${first}-01`, to: `${last}-31` };
      setGlobalDateRange(range);
      await loadDataFromDb(range.from, range.to);
      return;
    }

    const range = { from: `${monthStr}-01`, to: `${monthStr}-31` };
    setGlobalDateRange(range);
    await loadDataFromDb(range.from, range.to);
  };

  if (availableMonths.length === 0) return null;

  return (
    <div className="bg-[#050505] border border-zinc-900 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 mb-8 shadow-2xl">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
          <Database className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Time Machine</h3>
          <p className="text-xs text-zinc-500">{availableMonths.length} meses en memoria local</p>
        </div>
      </div>
      
      <div className="w-px h-8 bg-zinc-800 mx-2 hidden md:block"></div>

      <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 md:pb-0">
        <button
          onClick={() => handleMonthChange("all")}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            globalDateRange?.from === `${availableMonths[0]}-01` && globalDateRange?.to === `${availableMonths[availableMonths.length - 1]}-31`
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
              : "bg-[#0a0a0a] text-zinc-400 hover:text-white border border-zinc-800"
          }`}
        >
          Todo el Histórico
        </button>
        {availableMonths.map((m) => {
          const isActive = globalDateRange?.from === `${m}-01`;
          return (
            <button
              key={m}
              onClick={() => handleMonthChange(m)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "bg-[#0a0a0a] text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>
    </div>
  );
}
