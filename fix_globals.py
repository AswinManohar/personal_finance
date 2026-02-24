import os

with open('index.css', 'a') as f:
    f.write('\n/* Global Brand Utilities */\n')
    f.write(".bg-metric-gradient {\n")
    f.write("    @apply bg-gradient-to-br border from-purple-100/60 to-indigo-50/60 dark:from-purple-900/30 dark:to-indigo-900/30 border-purple-300 dark:border-purple-800/50;\n")
    f.write("}\n\n")
    f.write("@keyframes soft-pulse {\n")
    f.write("    0% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4); }\n")
    f.write("    70% { box-shadow: 0 0 0 10px rgba(168, 85, 247, 0); }\n")
    f.write("    100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0); }\n")
    f.write("}\n\n")
    f.write(".btn-pulse {\n")
    f.write("    @apply transition-all duration-300 relative;\n")
    f.write("}\n\n")
    f.write(".btn-pulse:hover {\n")
    f.write("    animation: soft-pulse 1.5s infinite;\n    @apply scale-[1.02];\n")
    f.write("}\n")
    f.write(".btn-pulse:active {\n")
    f.write("    @apply scale-[0.98];\n    animation: none;\n")
    f.write("}\n")

print("Added globals to index.css")
