#!/usr/bin/env python3
# Update filtering logic for nested license categories

with open('src/App.tsx', 'r') as f:
    content = f.read()

# New filtering logic that handles nested license categories
new_filter_logic = '''        // License filter - handle nested categories
        const licenseFilters = drillSettings.licenseFilters;
        if (licenseFilters) {
          const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
          
          // Check if any PPL subcategory is selected
          const pplSelected = licenseFilters.pplSubcategories.pplA || 
                             licenseFilters.pplSubcategories.pplH ||
                             licenseFilters.pplSubcategories.otherPPL ||
                             licenseFilters.pplSubcategories.lapl ||
                             licenseFilters.pplSubcategories.ultralight;
          
          // Check if any SPL subcategory is selected
          const splSelected = licenseFilters.splSubcategories.gliders ||
                             licenseFilters.splSubcategories.balloons;
          
          // If any filters are active, check if question matches
          if (pplSelected || splSelected) {
            const matchesPPL = appliesTo.includes('PPL') && pplSelected;
            const matchesSPL = appliesTo.includes('SPL') && splSelected;
            
            if (!matchesPPL && !matchesSPL) return false;
          }
        }'''

# Find and replace the old license filter logic
old_filter = '''        // License filter - only show questions for selected license
        const appliesTo = q.metadata?.applies_to || ['PPL', 'SPL'];
        if (selectedLicense !== 'BOTH' && !appliesTo.includes(selectedLicense)) return false;'''

if old_filter in content:
    content = content.replace(old_filter, new_filter_logic)
    print("Updated filtering logic")
else:
    print("Could not find old filter logic")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done!")
