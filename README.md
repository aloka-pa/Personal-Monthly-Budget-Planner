# Wallet Check

Wallet Check is a browser-based personal finance application for recording income and expenses, setting monthly budgets, planning future costs, tracking savings goals, and reviewing long-term financial patterns.

**Live application:** [aloka-pa.github.io/Personal-Monthly-Budget-Planner](https://aloka-pa.github.io/Personal-Monthly-Budget-Planner/)

### Demo Access

Anyone interested in exploring the application can use the following demo account:

- **Email:** `isabellataylortest@gmail.com`
- **Password:** `Test@123_Isabella`
- Note: Populated data available for July and August 2026

Feel free to log in and explore the available features. 

## Development Status

Wallet Check is a working application that is still actively evolving. Development follows an iterative **100-day plan**, with regular updates improving its personal finance tools, analytics, usability, and architecture.

The features documented below reflect what is currently implemented in the repository.

## Overview

Wallet Check began as a personal monthly expense tracker. Its original workflow—record income, add categorized expenses, and review the remaining balance—now forms the foundation of a broader personal finance platform.

The application has grown to include category budgets, savings goals, planned expenses, historical analytics, spending streaks, and a Financial Health Score. The current implementation remains a lightweight static frontend, while Supabase provides authentication and persistent, user-isolated financial data.

## Features

| Day | Feature Name | Description |
| --- | --- | --- |
| 01 | Authentication | Register, sign in, sign out, persist browser sessions, and protect application pages with Supabase Auth. |
| 02 | Profile and Currency Preferences | Maintain a name, designation, and company profile, and select LKR or USD when income is first configured. <img width="1588" height="550" alt="image" src="https://github.com/user-attachments/assets/dc9ad357-eb27-4dd0-ba92-1b899ae2c074" />|
| 03 | Themes and Responsive Navigation | Persist dark or light mode and use a collapsible desktop sidebar and mobile navigation drawer. <img width="1911" height="858" alt="image" src="https://github.com/user-attachments/assets/54f746d8-1816-4d1a-b439-e027ff44268a" />|
| 04 | Monthly Income Tracking | Add or update one income amount per month and browse past or future months. |
| 05 | Expense Management | Record, edit, delete, categorize, date, describe, and manage expenses for a selected budget month. |
| 06 | Categories and Payment Methods | Use predefined or custom categories, optionally exclude custom categories from budget tracking, and record supported payment methods. <img width="1622" height="406" alt="image" src="https://github.com/user-attachments/assets/db0fb164-e5c9-42aa-b449-8ca5499c301c" />|
| 07 | Expense Calendar | Switch between table and calendar views, inspect budget-based daily spending indicators, and manage expenses from a day-details dialog. <img width="1576" height="645" alt="image" src="https://github.com/user-attachments/assets/93b30ad5-2c03-406b-ad6a-78efef4905e4" /><img width="1624" height="489" alt="image" src="https://github.com/user-attachments/assets/6db123b9-3b4b-4fed-af9c-2f16ca3d67c8" />|
| 08 | Monthly Category Budgets | Set category-level budgets and review the overall budget, spending, remaining amount, usage percentage, and per-category status. <img width="1621" height="864" alt="image" src="https://github.com/user-attachments/assets/b52427de-b171-432d-ae3f-5f37fe72b528" />|
| 09 | Budget Search, Sorting, and Copy | Search and sort category budgets and copy the previous month's configured amounts into the selected month. |
| 10 | Dashboard and Monthly History | Review all recorded months through income, spending, balance, and color-coded monthly summary tiles. |
| 11 | Category Spending Trends | Compare category spending across the complete recorded history with a multi-series Chart.js line chart. <img width="1636" height="687" alt="image" src="https://github.com/user-attachments/assets/67daddb5-3b04-47a8-ac5f-bb4968725d1c" />|
| 12 | Financial Goals | Create, edit, delete, search, and sort goals with targets, dates, priorities, icons, notes, status, and progress. |
| 13 | Goal Contributions and Completion | Add, edit, and delete dated contributions; view saved, remaining, completion percentage, and aggregate dashboard progress. <img width="1635" height="862" alt="Screenshot 2026-08-23 161613" src="https://github.com/user-attachments/assets/4c102752-2a8c-43b0-99ac-e8bc297b9657" />|
| 14 | Financial Planner | Create and manage monthly planned expenses, assign categories and statuses, filter the list, and review totals by status. |
| 15 | Spending Streaks and Statistics | Show consecutive under-budget days and months plus today's spending, daily target, and on-track status. <img width="1629" height="435" alt="image" src="https://github.com/user-attachments/assets/466257db-801b-4848-8571-35d733fe7824" />|
| 16 | In-App Calculator | Open a keyboard-accessible calculator for arithmetic, percentages, sign changes, decimals, and operator precedence from any workspace page. <img width="1630" height="550" alt="image" src="https://github.com/user-attachments/assets/e407f11d-8a18-4cfe-9113-4340d3d2a027" />|
| 17 | Quick Goal View | Quickly view active financial goals, their current progress, and completion percentages directly from the header. Goals are prioritized by those closest to completion. <img width="1585" height="533" alt="image" src="https://github.com/user-attachments/assets/05fad15f-85cf-446a-a147-83eb78bd8ddf" />|
| 18 | Financial Health Score | Evaluate the latest completed month using budgeting, saving, spending consistency, and goal progress, with data-aware weighting.  <br> Compare the result with the immediately preceding month when both scores use the same available components, and provide a short explanation of the factors affecting the result. <br> • For formulas, availability rules, historical cutoffs, and edge cases, see [Financial Health Score Logic](docs/Financial-Health-Score-Logic.md). <img width="1582" height="510" alt="image" src="https://github.com/user-attachments/assets/e4d9e0ba-6130-4cb7-bf9a-3419c60d0e40" />|
| 19 | Expense vs. Saving Classification | Classify each expense as genuine spending or money set aside as savings, so savings entries count toward the Saving Score instead of dragging it down, while still being excluded from Budgeting, Spending Consistency, Budgets, and spending streaks—balances always reflect the full amount either way. <img width="1585" height="861" alt="image" src="https://github.com/user-attachments/assets/38ccca64-f43f-4934-8339-4f60b2b52138" />|


## Technology Stack

| Technology | Use |
| --- | --- |
| HTML5 | Multi-page application structure and accessible forms/dialogs |
| CSS3 | Custom responsive layout, page styling, and light/dark themes |
| JavaScript | Client-side application logic with no framework or build step |
| Bootstrap 5.3.3 | Responsive components, forms, tables, modals, and utilities |
| Chart.js 4 | Historical category-spending line chart |
| Supabase JS 2 | Browser client for authentication and database access |
| Supabase Auth and PostgreSQL | User accounts, relational finance data, constraints, and Row Level Security |
| GitHub Pages | Static application hosting |

Bootstrap, Bootstrap Icons, Chart.js, and Supabase JS are loaded from CDNs. The repository does not use npm, a JavaScript framework, or a compilation step.

## Setup / Running the Project

Wallet Check is a static application and does not require dependency installation or a build command.

1. Clone or download the repository.
2. Create or select a Supabase project.
3. Review the numbered files in `Supbase scripts/`. They are incremental scripts for the existing schema and define the application's tables, constraints, triggers, indexes, and Row Level Security policies. For a new project, first account for the schema note below.
4. Apply the compatible scripts in numerical order through the Supabase SQL editor.
5. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `config.js` to the target project's URL and publishable anonymous key. The checked-in file currently targets the hosted Wallet Check project.
6. Serve the repository root through a static web server, or deploy it as a static site. Open `index.html` to register or sign in.

The external CDN resources must be reachable in the browser. Supabase email-confirmation behavior depends on the authentication settings of the selected project.

## Data and Security

Supabase Row Level Security policies restrict profiles, income, expenses, budgets, goals, contributions, and planned expenses to their owning authenticated user. Shared default categories are readable by all authenticated users, while custom categories remain user-specific.

The Supabase anonymous key in `config.js` is a browser-facing publishable key; data isolation depends on the included RLS policies being applied correctly.
