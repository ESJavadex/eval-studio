"use client";

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "runner", label: "Runner" },
  { id: "scoreboard", label: "Scoreboard" },
];

export default function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <div className="flex border-b border-zinc-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === tab.id
              ? "text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          )}
        </button>
      ))}
    </div>
  );
}
