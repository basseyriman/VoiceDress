export function VoiceRibbon({ position = "bottom" }: { position?: "top" | "bottom" }) {
  const isTop = position === "top";

  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 h-96 overflow-hidden opacity-40 select-none ${
        isTop ? "-top-24" : "-bottom-32"
      }`}
    >
      <svg
        className={`h-full w-[250vw] ${isTop ? "rotate-180" : ""}`}
        viewBox="0 0 2500 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          id="voice-path"
          d="M -100,250 C 400,-100 800,400 1300,150 C 1800,-100 2200,400 2600,150"
        />
        <text className="font-display text-4xl italic fill-champagne tracking-[0.1em]">
          <textPath href="#voice-path" startOffset="0%">
            <animate
              attributeName="startOffset"
              from="0%"
              to="-50%"
              begin="0s"
              dur="45s"
              repeatCount="indefinite"
            />
            "I need an outfit for a dinner date" • "Swap the shoes" • "Make it more casual" • "Add a jacket" • "What should I wear to travel?" • "Show me something vintage" • "I need an outfit for a dinner date" • "Swap the shoes" • "Make it more casual" • "Add a jacket" • "What should I wear to travel?" • "Show me something vintage" • "I need an outfit for a dinner date" • "Swap the shoes" • "Make it more casual" • "Add a jacket" • "What should I wear to travel?" • "Show me something vintage"
          </textPath>
        </text>
      </svg>
    </div>
  );
}
