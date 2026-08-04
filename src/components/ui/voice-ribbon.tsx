export function VoiceRibbon() {
  return (
    <div className="pointer-events-none absolute -bottom-32 left-0 right-0 h-96 overflow-hidden opacity-40 select-none">
      <svg
        className="h-full w-[250vw]"
        viewBox="0 0 2500 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          id="voice-path"
          d="M -500,400 Q 1250,-200 3000,400"
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
