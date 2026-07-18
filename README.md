# Wallet Check

A personal monthly budget planner built with plain HTML, CSS, and JavaScript. It uses Supabase for authentication and data storage, and Chart.js for spending trends — designed for simple, real-world monthly money tracking with month-by-month navigation and a dark mode default.

**Live app:** https://aloka-pa.github.io/Personal-Monthly-Budget-Planner/

# Table of Contents

- [1. Features](#1-features)
  - [1.1 Authentication](#11-authentication)
  - [1.2 Profile](#12-profile)
  - [1.3 Month Navigator](#13-month-navigator)
  - [1.4 Monthly Income](#14-monthly-income)
  - [1.5 Expenses](#15-expenses)
  - [1.6 Balance Summary](#16-balance-summary)
  - [1.7 Dashboard](#17-dashboard)
  - [1.8 UI & Theme](#18-ui--theme)
- [2. Tech Stack](#2-tech-stack)
- [3. Project Structure](#3-project-structure)
- [4. Database Schema](#4-database-schema)
- [5. Local Setup](#5-local-setup)
- [6. Usage Flow](#6-usage-flow)
- [7. Month Behavior Notes](#7-month-behavior-notes)
- [8. Security Notes](#8-security-notes)
- [9. Troubleshooting](#9-troubleshooting)
- [10. Roadmap](#10-roadmap)

## 1. Features

**1.1 Authentication**
- Register and log in with Supabase Auth
- Session-aware redirects between login, app, and dashboard
- Logout from any screen

<img width="1919" height="1017" alt="image" src="https://github.com/user-attachments/assets/4e2758fd-bebd-4129-9738-e276fb8e3a51" />
<img width="1919" height="1018" alt="image" src="https://github.com/user-attachments/assets/05b1b793-f24d-4daa-a8b6-c2db23b653de" />



**1.2 Profile**
- Editable profile card — full name, designation, company
- Auto-loaded on the main app screen

**1.3 Month Navigator**
- Prev/Next controls shared across income, expenses, and balance
- Locked at the current calendar month — no navigating into the future
- Freely revisit and update past months

**1.4 Monthly Income**
- One income record per month, upserted automatically
- Form pre-fills with the existing value when you revisit a month
  
<img width="1919" height="1020" alt="image" src="https://github.com/user-attachments/assets/ab8972ee-5cef-4e22-abae-3076ca0eae8b" />



**1.5 Expenses**
- Add expenses with amount, category, date & time, optional description, and a recurring flag
- Add custom categories on the fly, alongside the predefined set
- View, edit, and delete expenses for the selected month

<img width="1919" height="1016" alt="image" src="https://github.com/user-attachments/assets/994e01a6-7bc7-460d-9b18-e81af4ed5f2d" />


**1.6 Balance Summary**
- Income, Spent, and Current Balance shown as separate tiles
- Recalculates automatically per selected month
- Color-coded status:
  - Green — under 70% of income spent
  - Yellow — 70–90% spent
  - Red — over 90% spent, or balance negative

<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/6bf35282-e63e-4aa0-8711-e6f76ee9e704" />



**1.7 Dashboard**
- Full-history line chart, one line per category, month over month
- Monthly summary tiles from your earliest recorded month to the present

<img width="1919" height="1019" alt="image" src="https://github.com/user-attachments/assets/7dc19ef4-0c26-4696-96a2-717fa4d7ad9f" />


**1.8 UI & Theme**
- Clean, Apple-inspired design
- Dark mode by default, with a light mode toggle
- Theme preference saved in local storage
- Alerts auto-dismiss after 2 seconds

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript — no framework, no build step |
| UI | Bootstrap 5 (CDN) |
| Charts | Chart.js (CDN) |
| Backend | Supabase (Postgres + Auth) |
| Data access | Supabase JavaScript client (CDN) |
| Hosting | GitHub Pages |

## 3. Project Structure

```
├── index.html          # Login & registration
├── app.html             # Main app: profile, month nav, income, expenses, balance
├── dashboard.html        # Full-history analytics dashboard
├── config.js             # Supabase project URL and anon key
├── styles.css            # Theme and UI styling
├── supabaseClient.js      # Supabase client initialization
├── auth.js               # Auth flows and session guards
├── profile.js            # Profile load/update logic
├── income.js              # Monthly income + shared viewed-month state
├── expenses.js            # Categories, expense CRUD, balance refresh
├── dashboard.js           # Dashboard data processing and chart rendering
└── theme.js               # Light/dark mode toggle
```

## 4. Database Schema

This app expects a Supabase project with the following tables already set up, with Row Level Security enabled and scoped per authenticated user.

**`profiles`**
`user_id` (PK, FK → `auth.users`) · `full_name` · `designation` · `company` · `created_at` · `updated_at`

**`categories`**
`id` (PK) · `user_id` (nullable — `null` = shared predefined category) · `name` · `created_at`

**`monthly_incomes`**
`id` (PK) · `user_id` · `month` (date, stored as first of month) · `amount` · `created_at` · `updated_at`
Unique constraint on (`user_id`, `month`)

**`expenses`**
`id` (PK) · `user_id` · `category_id` (FK) · `amount` · `expense_datetime` · `description` (nullable) · `is_recurring` · `created_at` · `updated_at`

## 5. Local Setup

1. Clone the repository.
2. Open the folder in VS Code.
3. Add your Supabase project URL and anon key to `config.js`.
4. Start a local static server — e.g. the Live Server extension in VS Code.
5. Open the app in your browser, typically at `http://localhost:5500`.

## 6. Usage Flow

1. Register or log in.
2. Fill in your profile details.
3. Use the month navigator to pick the month you want to work on.
4. Enter that month's income.
5. Add expenses with category, amount, date/time, and an optional note.
6. Edit or delete entries as needed.
7. Check the Income, Spent, and Balance tiles at a glance.
8. Open the dashboard for long-term trends and monthly summaries.

## 7. Month Behavior Notes

- Income is saved against the currently viewed month.
- The expense list only shows entries for the currently viewed month.
- Balance = viewed month's income − viewed month's expenses.
- You can't navigate past the real current calendar month.

## 8. Security Notes

- The frontend uses the Supabase **anon key** only — never expose a service role key in client-side code.
- Data protection relies entirely on correctly configured RLS policies.
- If this repo is public, rotate credentials if you ever suspect exposure.

## 9. Troubleshooting

**Blank data after login**
Check that the session is active, RLS policies allow select/write for authenticated users, and table/column names match the schema above.

**Auth redirects behaving oddly**
Confirm the app is served from the correct root path, then clear local storage and log in again.

**Dashboard chart not rendering**
Check your internet connection for CDN scripts, and confirm Chart.js loads before `dashboard.js`.

**Theme not persisting**
Verify local storage is enabled in your browser and that `theme.js` is loaded on every page.

## 10. Roadmap

- Export monthly reports to CSV/PDF
- Category budget caps with warnings
- Recurring expense auto-generation
- Multi-currency support
- Progressive Web App support
