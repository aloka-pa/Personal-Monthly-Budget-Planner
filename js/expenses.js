// ============================================================
// expenses.js - categories loading, add/edit/delete expenses
// Stage 5: load categories (predefined + custom) and add expenses.
// Stages 6-7 will add edit/delete and the expense list.
// ============================================================
//
// CATEGORIES: a category with `user_id = null` is a shared,
// predefined category (Food, Bills, etc.) visible to everyone.
// A category with `user_id` set to the logged-in user's id is a
// custom category only they can see. We fetch both with an
// `.or()` filter and merge them into one dropdown.
// ============================================================

// Loads predefined + the user's custom categories into the
// #expenseCategory <select>, optionally selecting a given
// category id afterwards (used after adding a new category).
async function loadCategories(selectCategoryId = null) {
    const {
        data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data, error } = await supabaseClient
        .from("categories")
        .select("id, name, user_id")
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("name", { ascending: true });

    if (error) {
        console.error("Failed to load categories:", error.message);
        return;
    }

    const select = document.getElementById("expenseCategory");
    select.innerHTML = "";

    data.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });

    if (selectCategoryId) {
        select.value = selectCategoryId;
    }
}

function showExpenseAlert(message, type = "danger") {
    const alertBox = document.getElementById("expenseAlert");
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
}

function hideExpenseAlert() {
    const alertBox = document.getElementById("expenseAlert");
    if (!alertBox) return;
    alertBox.classList.add("d-none");
}

// Wires up the inline "add custom category" button.
function setupAddCategory() {
    const addBtn = document.getElementById("addCategoryBtn");
    if (!addBtn) return;

    addBtn.addEventListener("click", async () => {
        hideExpenseAlert();

        const input = document.getElementById("newCategoryName");
        const name = input.value.trim();
        if (!name) {
            showExpenseAlert("Enter a name for the new category.");
            return;
        }

        const {
            data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from("categories")
            .insert({ user_id: user.id, name })
            .select("id")
            .single();

        if (error) {
            showExpenseAlert(error.message);
            return;
        }

        input.value = "";
        await loadCategories(data.id);
    });
}

// Prefills the datetime-local input with the current date/time,
// formatted as required by the input ("YYYY-MM-DDTHH:mm").
function setDefaultExpenseDatetime() {
    const input = document.getElementById("expenseDatetime");
    if (!input) return;

    const now = new Date();
    // Adjust for the local timezone offset so toISOString() gives
    // local time instead of UTC, then trim to minutes.
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    input.value = localTime.toISOString().slice(0, 16);
}

// Wires up the add expense form submission.
function setupExpenseForm() {
    const form = document.getElementById("expenseForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideExpenseAlert();

        const {
            data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) return;

        const amount = parseFloat(document.getElementById("expenseAmount").value);
        const categoryId = document.getElementById("expenseCategory").value;
        const datetimeValue = document.getElementById("expenseDatetime").value;
        const description = document.getElementById("expenseDescription").value.trim();
        const isRecurring = document.getElementById("expenseRecurring").checked;

        if (isNaN(amount) || amount <= 0) {
            showExpenseAlert("Amount must be greater than 0.");
            return;
        }
        if (!categoryId) {
            showExpenseAlert("Please choose a category.");
            return;
        }
        if (!datetimeValue) {
            showExpenseAlert("Please choose a date and time.");
            return;
        }

        const { error } = await supabaseClient.from("expenses").insert({
            user_id: user.id,
            category_id: categoryId,
            amount,
            expense_datetime: new Date(datetimeValue).toISOString(),
            description: description || null,
            is_recurring: isRecurring,
        });

        if (error) {
            showExpenseAlert(error.message);
            return;
        }

        showExpenseAlert("Expense added!", "success");
        form.reset();
        setDefaultExpenseDatetime();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Only run on app.html, where the expense form exists.
    if (!document.getElementById("expenseForm")) return;

    loadCategories();
    setupAddCategory();
    setupExpenseForm();
    setDefaultExpenseDatetime();
});
