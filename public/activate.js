function clearAlerts() {
    document.getElementById('errorBox').style.display = 'none';
    document.getElementById('successBox').style.display = 'none';
}

document.getElementById('activateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const employeeId = document.getElementById('employeeId').value.trim();
    const name = document.getElementById('activateName').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        document.getElementById('errorBox').innerText = 'Passwords do not match!';
        document.getElementById('errorBox').style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId, name, newPassword })
        });

        const data = await res.json();
        if (!res.ok) {
            document.getElementById('errorBox').innerText = data.error || 'Activation failed!';
            document.getElementById('errorBox').style.display = 'block';
            return;
        }

        document.getElementById('successBox').innerText = 'Account activated! Redirecting to login...';
        document.getElementById('successBox').style.display = 'block';
        document.getElementById('activateForm').reset();

        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
    } catch (err) {
        document.getElementById('errorBox').innerText = 'Server error during activation.';
        document.getElementById('errorBox').style.display = 'block';
    }
});