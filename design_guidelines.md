{
  "design_system_name": "PetroChina GPP Inventory — Clarity-First Enterprise Dashboard",
  "brand_attributes": [
    "industrial-professional",
    "high-trust / audit-friendly",
    "data-dense but calm",
    "fast scanning (status-first)",
    "low visual fatigue for daily use"
  ],
  "visual_personality": {
    "style_fusion": [
      "Swiss/International Typographic Style (grid + hierarchy)",
      "Modern enterprise admin (shadcn shell patterns)",
      "Industrial control-room calm (muted neutrals + ocean-teal accents)",
      "Bento grid for dashboard widgets (asymmetric, but disciplined)"
    ],
    "do_not": [
      "No transparent/glass backgrounds (explicit constraint)",
      "No heavy animations on large tables",
      "No emoji icons (use lucide-react)",
      "No purple for AI-like vibes (not relevant here anyway)",
      "No gradients beyond small decorative header band (<=20% viewport)"
    ]
  },
  "typography": {
    "font_pairing": {
      "heading": {
        "family": "Space Grotesk",
        "google_fonts_import": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
        "usage": "Page titles, KPI numbers, section headers"
      },
      "body": {
        "family": "IBM Plex Sans",
        "google_fonts_import": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap",
        "usage": "Tables, forms, helper text"
      },
      "numeric_optional": {
        "family": "IBM Plex Mono",
        "google_fonts_import": "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap",
        "usage": "Item codes, UOM, rates when you want fixed-width alignment"
      }
    },
    "tailwind_usage_notes": [
      "Set body font to IBM Plex Sans; headings use Space Grotesk via utility class (e.g., font-[var(--font-heading)])",
      "Use tabular-nums for currency/stock columns: `tabular-nums`",
      "Avoid oversized H2; keep subheading at text-base md:text-lg per constraint"
    ],
    "type_scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight",
      "h2": "text-base md:text-lg font-medium text-muted-foreground",
      "section_title": "text-sm font-semibold tracking-wide uppercase text-muted-foreground",
      "kpi_value": "text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums",
      "table_header": "text-xs font-semibold uppercase tracking-wide",
      "body": "text-sm md:text-base",
      "small": "text-xs"
    }
  },
  "color_system": {
    "notes": [
      "Enterprise neutral base with ocean-teal accent (trustworthy, industrial).",
      "Status colors must map to red/yellow/green/blue semantics from requirements.",
      "No saturated gradients; keep backgrounds solid and readable."
    ],
    "tokens_css": ":root {\n  /* Core surfaces */\n  --background: 210 20% 98%; /* near-white cool */\n  --foreground: 222 22% 12%;\n  --card: 0 0% 100%;\n  --card-foreground: 222 22% 12%;\n  --popover: 0 0% 100%;\n  --popover-foreground: 222 22% 12%;\n\n  /* Brand accent (ocean teal) */\n  --primary: 188 72% 28%;\n  --primary-foreground: 0 0% 100%;\n\n  /* Secondary neutrals */\n  --secondary: 210 18% 94%;\n  --secondary-foreground: 222 22% 12%;\n  --muted: 210 18% 95%;\n  --muted-foreground: 215 14% 40%;\n  --accent: 210 18% 94%;\n  --accent-foreground: 222 22% 12%;\n\n  /* Borders & focus */\n  --border: 214 18% 86%;\n  --input: 214 18% 86%;\n  --ring: 188 72% 28%;\n\n  /* Semantic states */\n  --destructive: 0 72% 52%;\n  --destructive-foreground: 0 0% 100%;\n\n  /* Status chips (inventory status) */\n  --status-below-min: 0 72% 52%;      /* red */\n  --status-minimum: 45 92% 50%;       /* yellow */\n  --status-ok: 152 55% 36%;           /* green */\n  --status-above-max: 210 85% 45%;    /* blue */\n\n  /* Charts (Recharts) */\n  --chart-1: 188 72% 28%;\n  --chart-2: 210 85% 45%;\n  --chart-3: 152 55% 36%;\n  --chart-4: 45 92% 50%;\n  --chart-5: 0 72% 52%;\n\n  --radius: 0.75rem;\n}\n\n/* Optional: dark mode for control rooms (not default) */\n.dark {\n  --background: 222 22% 10%;\n  --foreground: 210 20% 96%;\n  --card: 222 22% 12%;\n  --card-foreground: 210 20% 96%;\n  --popover: 222 22% 12%;\n  --popover-foreground: 210 20% 96%;\n  --primary: 188 70% 40%;\n  --primary-foreground: 222 22% 10%;\n  --secondary: 222 18% 18%;\n  --secondary-foreground: 210 20% 96%;\n  --muted: 222 18% 18%;\n  --muted-foreground: 215 14% 70%;\n  --accent: 222 18% 18%;\n  --accent-foreground: 210 20% 96%;\n  --border: 222 18% 22%;\n  --input: 222 18% 22%;\n  --ring: 188 70% 40%;\n}",
    "status_color_mapping": {
      "below_minimum": {
        "label": "Below Minimum",
        "chip": "bg-[hsl(var(--status-below-min)/0.12)] text-[hsl(var(--status-below-min))] border-[hsl(var(--status-below-min)/0.25)]",
        "dot": "bg-[hsl(var(--status-below-min))]"
      },
      "minimum": {
        "label": "Minimum",
        "chip": "bg-[hsl(var(--status-minimum)/0.14)] text-[hsl(var(--status-minimum))] border-[hsl(var(--status-minimum)/0.28)]",
        "dot": "bg-[hsl(var(--status-minimum))]"
      },
      "ok": {
        "label": "OK",
        "chip": "bg-[hsl(var(--status-ok)/0.12)] text-[hsl(var(--status-ok))] border-[hsl(var(--status-ok)/0.25)]",
        "dot": "bg-[hsl(var(--status-ok))]"
      },
      "above_maximum": {
        "label": "Above Maximum",
        "chip": "bg-[hsl(var(--status-above-max)/0.12)] text-[hsl(var(--status-above-max))] border-[hsl(var(--status-above-max)/0.25)]",
        "dot": "bg-[hsl(var(--status-above-max))]"
      }
    },
    "gradient_policy": {
      "allowed": [
        "Only as a thin decorative header band or page hero strip (<= 120px height)",
        "Only on section backgrounds, never on cards/tables",
        "Max 20% viewport coverage"
      ],
      "safe_gradients": [
        "bg-gradient-to-r from-[hsl(210_20%_98%)] via-[hsl(188_60%_92%)] to-[hsl(210_20%_98%)]",
        "bg-gradient-to-r from-[hsl(210_20%_98%)] via-[hsl(210_18%_94%)] to-[hsl(210_20%_98%)]"
      ],
      "prohibited": [
        "blue-500 to purple-600",
        "purple-500 to pink-500",
        "green-500 to blue-500",
        "red to pink",
        "any dark/saturated gradient combos"
      ]
    }
  },
  "layout_and_grid": {
    "app_shell": {
      "pattern": "Persistent left sidebar + sticky top header + scrollable content",
      "sidebar_width": "w-[272px] (desktop), collapsible to icon rail w-[72px]",
      "content_max_width": "Do NOT center the whole app; use full width with internal max widths only for charts/forms (e.g., max-w-[1400px])",
      "page_padding": "px-4 sm:px-6 lg:px-8 py-5",
      "grid": "12-col grid for dashboard widgets: grid-cols-12 gap-4 lg:gap-6"
    },
    "dashboard_widget_layout": {
      "row_1_kpis": "4 KPI cards: col-span-12 sm:col-span-6 xl:col-span-3",
      "row_2": "Value by Item Type chart: col-span-12 xl:col-span-7; Alerts panel: col-span-12 xl:col-span-5",
      "row_3": "Top 20 High-Value Items table: col-span-12 xl:col-span-8; Non-moving items preview: col-span-12 xl:col-span-4"
    },
    "inventory_page_layout": {
      "top_controls": "Sticky filter bar (search + filters + export) with subtle border-b",
      "table_area": "Full-width table inside Card; server pagination footer always visible",
      "detail": "Item detail uses Drawer on mobile, Dialog/Sheet on desktop right side"
    }
  },
  "component_path": {
    "shadcn_primary": {
      "navigation": [
        "/app/frontend/src/components/ui/sheet.jsx",
        "/app/frontend/src/components/ui/navigation-menu.jsx",
        "/app/frontend/src/components/ui/breadcrumb.jsx",
        "/app/frontend/src/components/ui/separator.jsx"
      ],
      "structure": [
        "/app/frontend/src/components/ui/card.jsx",
        "/app/frontend/src/components/ui/tabs.jsx",
        "/app/frontend/src/components/ui/scroll-area.jsx",
        "/app/frontend/src/components/ui/resizable.jsx"
      ],
      "forms": [
        "/app/frontend/src/components/ui/form.jsx",
        "/app/frontend/src/components/ui/input.jsx",
        "/app/frontend/src/components/ui/select.jsx",
        "/app/frontend/src/components/ui/textarea.jsx",
        "/app/frontend/src/components/ui/checkbox.jsx",
        "/app/frontend/src/components/ui/radio-group.jsx",
        "/app/frontend/src/components/ui/switch.jsx",
        "/app/frontend/src/components/ui/calendar.jsx"
      ],
      "feedback": [
        "/app/frontend/src/components/ui/sonner.jsx",
        "/app/frontend/src/components/ui/alert.jsx",
        "/app/frontend/src/components/ui/alert-dialog.jsx",
        "/app/frontend/src/components/ui/skeleton.jsx",
        "/app/frontend/src/components/ui/progress.jsx",
        "/app/frontend/src/components/ui/tooltip.jsx"
      ],
      "data_display": [
        "/app/frontend/src/components/ui/table.jsx",
        "/app/frontend/src/components/ui/badge.jsx",
        "/app/frontend/src/components/ui/pagination.jsx",
        "/app/frontend/src/components/ui/hover-card.jsx",
        "/app/frontend/src/components/ui/drawer.jsx",
        "/app/frontend/src/components/ui/dialog.jsx"
      ]
    },
    "recommended_new_components_to_create": [
      "/app/frontend/src/components/layout/AppShell.js (sidebar + header + content)",
      "/app/frontend/src/components/layout/SidebarNav.js (nav groups + collapse)",
      "/app/frontend/src/components/dashboard/KpiCard.js",
      "/app/frontend/src/components/dashboard/AlertsPanel.js",
      "/app/frontend/src/components/inventory/StatusChip.js",
      "/app/frontend/src/components/inventory/InventoryTableToolbar.js",
      "/app/frontend/src/components/inventory/ItemDetailDrawer.js",
      "/app/frontend/src/components/charts/ValueByTypeDonut.js",
      "/app/frontend/src/components/charts/ConsumptionTrendChart.js"
    ]
  },
  "data_dense_table_guidelines": {
    "performance": [
      "Server-side pagination + sorting + filtering (15,000 rows).",
      "Avoid row hover animations that trigger layout; use only background-color transition.",
      "Use `ScrollArea` for horizontal overflow; keep header sticky.",
      "Prefer fixed column widths for numeric columns to prevent jitter."
    ],
    "table_specs": {
      "row_height": "h-11 (comfortable) or h-10 (dense mode toggle)",
      "header": "sticky top-0 z-10 bg-background/95 backdrop-blur-[2px] supports-[backdrop-filter]:bg-background/80 border-b",
      "zebra": "odd:bg-muted/30",
      "hover": "hover:bg-muted/50 transition-colors",
      "numeric_alignment": "text-right tabular-nums",
      "code_column": "font-mono text-xs tracking-tight",
      "status_column": "StatusChip (Badge variant) with dot + label"
    },
    "filters": {
      "pattern": "Toolbar with Search (Input), Item Type (Select), Status (Select), UOM (Input/Select), Min/Max quick toggles",
      "sticky": "Toolbar sticks under header on scroll for fast scanning"
    },
    "empty_states": {
      "copy": "No items match your filters.",
      "actions": [
        "Clear filters",
        "Export current view"
      ]
    }
  },
  "dashboard_guidelines": {
    "kpi_cards": {
      "layout": "Card with title (text-xs uppercase), value (kpi_value), delta badge (Badge) and tiny sparkline optional",
      "kpis": [
        "Total Inventory Value (USD)",
        "Total Items",
        "Low Stock Items",
        "Non-moving (365d)"
      ],
      "classes": {
        "card": "rounded-xl border bg-card shadow-sm",
        "title": "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        "value": "text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums",
        "delta_good": "bg-[hsl(var(--status-ok)/0.12)] text-[hsl(var(--status-ok))]",
        "delta_bad": "bg-[hsl(var(--status-below-min)/0.12)] text-[hsl(var(--status-below-min))]"
      }
    },
    "charts": {
      "library": "Recharts",
      "patterns": [
        "Donut chart for value by item type with legend + percentages",
        "Bar chart for monthly consumption trend (per item detail)",
        "Line chart for cumulative consumption (optional toggle)"
      ],
      "chart_container": "Wrap charts in Card; keep chart background solid; use CSS vars --chart-1..5",
      "tooltip": "Use shadcn Tooltip/Popover style; show USD formatting and units"
    },
    "alerts_panel": {
      "content": [
        "Below Minimum list (top 10) with quick actions: View item, Create transaction",
        "Minimum list (top 10)",
        "Above Maximum list (optional)"
      ],
      "interaction": "Each row is clickable; opens ItemDetailDrawer",
      "visual": "Use StatusChip + compact meta (Item Code, Current/Min/Max)"
    }
  },
  "forms_and_transactions": {
    "transaction_form": {
      "layout": "Two-column on lg, single column on mobile",
      "fields": [
        "Item Code (Command component for search-as-you-type)",
        "Type (Select: Purchase Order, Work Order, Return from Work Order, Return Other)",
        "Direction (IN/OUT) as segmented ToggleGroup",
        "Quantity (Input, numeric)",
        "Unit Rate (Input, numeric, USD)",
        "Date (Calendar + Popover)",
        "Reference No (Input)",
        "Notes (Textarea)"
      ],
      "validation": "Inline errors under fields; summary toast on submit"
    },
    "history_table": {
      "columns": [
        "Date",
        "Item Code",
        "Type",
        "IN/OUT",
        "Qty",
        "Unit Rate",
        "Total",
        "Reference"
      ],
      "filters": "Date range (Calendar), Type (Select), Item Code search"
    }
  },
  "micro_interactions_and_motion": {
    "principles": [
      "Motion should confirm actions, not decorate.",
      "Avoid animating layout properties in tables.",
      "Respect prefers-reduced-motion."
    ],
    "recommended": {
      "buttons": "hover:brightness-[0.98] active:scale-[0.98] transition-[background-color,box-shadow,filter] duration-150",
      "cards": "hover:shadow-md transition-shadow duration-200 (dashboard only)",
      "drawer": "Use Drawer/Sheet default slide; keep duration short",
      "row_hover": "transition-colors duration-150"
    },
    "optional_library": {
      "name": "framer-motion",
      "use_cases": [
        "Dashboard widget entrance (only above-the-fold)",
        "Drawer content fade-in"
      ],
      "install": "npm i framer-motion",
      "scaffold_js": "import { motion } from 'framer-motion';\n\nexport default function FadeIn({ children }) {\n  return (\n    <motion.div\n      initial={{ opacity: 0, y: 6 }}\n      animate={{ opacity: 1, y: 0 }}\n      transition={{ duration: 0.18, ease: 'easeOut' }}\n    >\n      {children}\n    </motion.div>\n  );\n}"
    }
  },
  "accessibility": {
    "requirements": [
      "WCAG AA contrast for text on backgrounds.",
      "Visible focus ring: use ring color from --ring.",
      "Do not rely on color alone for status: include label text + dot icon.",
      "Keyboard navigable tables: focusable row actions and pagination."
    ],
    "aria_notes": [
      "StatusChip should include sr-only text for screen readers if using only dot.",
      "Charts must have textual summaries below (e.g., top category + percentage)."
    ]
  },
  "testing_attributes": {
    "rule": "All interactive and key informational elements MUST include data-testid (kebab-case).",
    "examples": [
      "data-testid=\"sidebar-nav-inventory-link\"",
      "data-testid=\"dashboard-total-inventory-value\"",
      "data-testid=\"inventory-search-input\"",
      "data-testid=\"inventory-export-excel-button\"",
      "data-testid=\"transactions-add-submit-button\"",
      "data-testid=\"item-detail-consumption-chart\"",
      "data-testid=\"settings-save-button\""
    ]
  },
  "images_urls": {
    "usage_policy": [
      "Use imagery sparingly (enterprise tool).",
      "Only for empty states, import/export helper panel, or a subtle dashboard header illustration.",
      "Avoid photos behind text; keep them in side panels or empty states."
    ],
    "categories": [
      {
        "category": "empty_state_import_export",
        "description": "Small illustration/photo in Import/Export page side panel",
        "urls": [
          "https://images.unsplash.com/photo-1715174590972-d67048eb88bd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwzfHx3YXJlaG91c2UlMjBsb2dpc3RpY3MlMjBpbnZlbnRvcnklMjBtYW5hZ2VtZW50fGVufDB8fHx0ZWFsfDE3ODc3NTkyMjR8MA&ixlib=rb-4.1.0&q=85"
        ]
      },
      {
        "category": "empty_state_inventory",
        "description": "Optional image for ‘no results’ state (keep small, right side)",
        "urls": [
          "https://images.unsplash.com/photo-1514982127339-266dcf5c399e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwyfHx3YXJlaG91c2UlMjBsb2dpc3RpY3MlMjBpbnZlbnRvcnklMjBtYW5hZ2VtZW50fGVufDB8fHx0ZWFsfDE3ODc3NTkyMjR8MA&ixlib=rb-4.1.0&q=85"
        ]
      }
    ]
  },
  "implementation_notes_js": {
    "file_convention": [
      "Project uses .js (not .tsx). Create components as .js with PropTypes optional.",
      "Use named exports for components; default exports for pages."
    ],
    "currency_formatting": {
      "snippet": "export const formatUSD = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value ?? 0);",
      "usage": "Use for KPI totals, unit rate, total value columns"
    },
    "table_stack_recommendation": {
      "library": "@tanstack/react-table",
      "install": "npm i @tanstack/react-table",
      "notes": [
        "Use manualPagination/manualSorting/manualFiltering for server-driven tables.",
        "Keep column definitions memoized; render cells with minimal components."
      ]
    }
  },
  "instructions_to_main_agent": [
    "Replace default CRA App.css centered header styles; do not center the app container.",
    "Update index.css :root tokens to the provided industrial-teal palette; keep cards white and backgrounds cool near-white.",
    "Build an AppShell with left sidebar + sticky header; use Sheet for mobile nav.",
    "Inventory table must be server-paginated and highly readable: sticky header, tabular nums, fixed widths for numeric columns.",
    "Implement StatusChip using Badge with dot + label; map to required red/yellow/green/blue semantics.",
    "All interactive and key informational elements must include data-testid attributes (kebab-case).",
    "Use Recharts for donut/bar/line charts; keep chart colors tied to CSS vars --chart-1..5.",
    "Use Sonner for toasts; avoid HTML-native dropdowns—use shadcn Select/Command/Popover.",
    "Keep motion subtle and targeted; avoid heavy animations in tables."
  ],
  "General UI UX Design Guidelines": "    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals."
}
