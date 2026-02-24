import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replacements for Tailwind classes
    replacements = {
        r'\btext-white\b': 'text-black dark:text-white',
        r'\bbg-black\b': 'bg-white dark:bg-black',
        r'\bbg-zinc-950\b': 'bg-zinc-50 dark:bg-zinc-950',
        r'\bborder-zinc-900\b': 'border-zinc-200 dark:border-zinc-900',
        r'\bborder-zinc-800\b': 'border-zinc-300 dark:border-zinc-800',
        r'\btext-zinc-400\b': 'text-zinc-600 dark:text-zinc-400',
        r'\btext-zinc-300\b': 'text-zinc-700 dark:text-zinc-300',
        r'\bbg-zinc-900\b': 'bg-zinc-100 dark:bg-zinc-900',
        r'\bbg-white\b': 'bg-zinc-900 dark:bg-white',
        r'\btext-black\b': 'text-white dark:text-black',
        r'\btext-zinc-900\b': 'text-zinc-100 dark:text-zinc-900',
        
        # We need to be careful with bg-white turning into bg-zinc-900, we might double replace
        # So we'll use a safer regex approach
    }
    
    # We will just write a specific safer regex sequence
    # To avoid double-replacing, we do it in one pass or use unique tokens
    
    # Replace Recharts explicit hex colors for tooltips and strokes
    content = content.replace('#ffffff', 'var(--chart-line)')
    content = content.replace('#27272a', 'var(--chart-grid)')
    content = content.replace('#000', 'var(--chart-bg)')
    content = content.replace('#fff', 'var(--chart-text)')
    
    # Simple token replacement to avoid double replace
    tokens = {
        'text-white': 'text-black dark:text-white',
        'bg-black': 'bg-white dark:bg-black',
        'bg-zinc-950': 'bg-zinc-50 dark:bg-zinc-950',
        'border-zinc-900': 'border-zinc-200 dark:border-zinc-900',
        'border-zinc-800': 'border-zinc-300 dark:border-zinc-800',
        'text-zinc-400': 'text-zinc-600 dark:text-zinc-400',
        'text-zinc-300': 'text-zinc-700 dark:text-zinc-300',
        'bg-zinc-900': 'bg-zinc-100 dark:bg-zinc-900',
        'bg-white': 'bg-black dark:bg-white',
        'text-black': 'text-white dark:text-black',
        'text-zinc-900': 'text-zinc-100 dark:text-zinc-900',
        'border-white': 'border-black dark:border-white',
        'hover:text-white': 'hover:text-black dark:hover:text-white',
        'hover:border-white': 'hover:border-black dark:hover:border-white'
    }

    # Split into matches to avoid double replace
    # We only replace things that are NOT preceded by `dark:`
    # e.g., (?<!dark:)text-white
    for old, new in tokens.items():
        pattern = r'(?<!dark:)(?<!\w)' + re.escape(old) + r'(?!\w)'
        content = re.sub(pattern, new, content)

    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('components'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

# Fix App.tsx and Login.tsx specifically if outside
process_file('App.tsx')

print("Done")
