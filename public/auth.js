function clearAlerts() {
    document.getElementById('errorBox').style.display = 'none';
}

document.getElementById('forgotPassLink').addEventListener('click', (e) => {
    e.preventDefault();
    alert('Please contact your System Administrator to reset your password.');
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const employeeId = document.getElementById('loginEmployeeId').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId, password })
        });

        const data = await res.json();
        if (!res.ok) {
            document.getElementById('errorBox').innerText = data.error || 'Login failed!';
            document.getElementById('errorBox').style.display = 'block';
            return;
        }

        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        window.location.href = '/index.html';
    } catch (err) {
        document.getElementById('errorBox').innerText = 'Server error during login.';
        document.getElementById('errorBox').style.display = 'block';
    }
});