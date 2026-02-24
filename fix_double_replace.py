import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The double replace logic went:
    # 1. text-white -> text-black dark:text-white
    # 2. text-black -> text-white dark:text-black
    # So 'text-black dark:text-white' became 'text-white dark:text-black dark:text-white'
    content = content.replace('text-white dark:text-black dark:text-white', 'text-black dark:text-white')
    
    # 1. bg-black -> bg-white dark:bg-black
    # 2. bg-white -> bg-black dark:bg-white
    # So 'bg-white dark:bg-black' became 'bg-black dark:bg-white dark:bg-black'
    content = content.replace('bg-black dark:bg-white dark:bg-black', 'bg-white dark:bg-black')

    # text-zinc-900 double replaces
    # Wait, text-zinc-900 wasn't double replaced in the same way because text-zinc-100 wasn't in the list? Let's fix known ones.
    
    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('components'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

process_file('App.tsx')

print("Fixed")
