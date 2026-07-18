// ============================================================
// profile.js - load/edit the logged-in user's profile
// ============================================================
//
// The `profiles` table has one row per user (user_id is both the
// primary key and a FK to auth.users), auto-created by a DB
// trigger on sign up with empty strings for full_name/designation
// /company. So we only ever UPDATE this row - it always exists.
// ============================================================

// Fetches the current user's profile row and fills in the
// profile card + the edit modal's inputs.
async function loadProfile() {
    const {
        data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) return; // guardPageWithSession() will have already redirected.

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("full_name, designation, company")
        .eq("user_id", user.id)
        .single();

    if (error) {
        console.error("Failed to load profile:", error.message);
        return;
    }

    renderProfileCard(data);

    // Pre-fill the edit modal inputs too.
    document.getElementById("editFullName").value = data.full_name || "";
    document.getElementById("editDesignation").value = data.designation || "";
    document.getElementById("editCompany").value = data.company || "";
}

// Updates the profile card text based on profile data.
function renderProfileCard(profile) {
    const nameEl = document.getElementById("profileFullName");
    const designationEl = document.getElementById("profileDesignation");
    const companyEl = document.getElementById("profileCompany");
    const sepEl = document.getElementById("profileCompanySep");

    nameEl.textContent = profile.full_name || "Add your name";
    designationEl.textContent = profile.designation || "";
    companyEl.textContent = profile.company || "";

    // Only show the " at " separator when both designation and
    // company are present.
    if (profile.designation && profile.company) {
        sepEl.classList.remove("d-none");
    } else {
        sepEl.classList.add("d-none");
    }
}

function showProfileAlert(message, type = "danger") {
    const alertBox = document.getElementById("profileAlert");
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
}

function hideProfileAlert() {
    const alertBox = document.getElementById("profileAlert");
    if (!alertBox) return;
    alertBox.classList.add("d-none");
}

// Wires up the edit profile form submission.
function setupEditProfileForm() {
    const form = document.getElementById("editProfileForm");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideProfileAlert();

        const {
            data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) return;

        const updatedProfile = {
            full_name: document.getElementById("editFullName").value.trim(),
            designation: document.getElementById("editDesignation").value.trim(),
            company: document.getElementById("editCompany").value.trim(),
        };

        const { error } = await supabaseClient
            .from("profiles")
            .update(updatedProfile)
            .eq("user_id", user.id);

        if (error) {
            showProfileAlert(error.message);
            return;
        }

        renderProfileCard(updatedProfile);

        // Close the modal using Bootstrap's JS API.
        const modalEl = document.getElementById("editProfileModal");
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    // Only run on app.html, where the profile card/modal exist.
    if (!document.getElementById("profileFullName")) return;

    loadProfile();
    setupEditProfileForm();
});
