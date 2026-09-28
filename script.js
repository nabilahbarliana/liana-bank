/* ==========================================================================
   LIEN'S BANK - DIGITAL BANKING SIMULATION SCRIPT
   Author: Lien's Bank Tech Team
   Features: Auth, LocalStorage State, Balance Locking, Top Up, Transfer,
             Bill Payments, Mutation History, CSV Export, Counters, Animations
   ========================================================================== */

// --------------------------------------------------------------------------
// SUPABASE CLIENT SETUP & HELPER
// --------------------------------------------------------------------------
function getSupabase() {
  if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.auth !== 'undefined') {
    return window.supabase;
  }
  if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://rdbswsypmqjjawasbxcf.supabase.co';
    const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : 'sb_publishable_v3wLGs2Kc1sk9uOheVkKGg_VHbWL_8Q';
    window.supabase = window.supabase.createClient(url, key);
    return window.supabase;
  }
  return null;
}

// --------------------------------------------------------------------------
// 1. STATE & LOCALSTORAGE MANAGEMENT
// --------------------------------------------------------------------------
const STORAGE_KEYS = {
  USER: 'liens_bank_user',
  BALANCE: 'liens_bank_balance',
  MUTATIONS: 'liens_bank_mutations',
  LOGGED_IN: 'liens_bank_is_logged_in'
};

// Default User Mock if none registered
const DEFAULT_USER = {
  name: "Lien Saputra",
  email: "lien.saputra@liensbank.com",
  phone: "085134901831",
  accountNo: "7890-5432-1099"
};

// Application State Variables
let currentUser = null;
let currentBalance = 0;
let mutations = [];

/**
 * Load user data, account, and transactions directly from Supabase
 */
async function loadUserDataFromSupabase(user) {
  const sb = getSupabase();
  if (!user) return;

  const defaultAccNo = '7890-' + user.id.slice(0, 4) + '-' + user.id.slice(4, 8);
  currentUser = {
    id: user.id,
    name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Nasabah Lien's",
    email: user.email || "",
    phone: user.phone || user.user_metadata?.phone || "081234567890",
    accountNo: defaultAccNo
  };

  if (sb) {
    try {
      // 1. Fetch Profile from 'profiles' table
      const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (profile) {
        currentUser.name = profile.full_name || profile.name || currentUser.name;
        currentUser.phone = profile.phone || currentUser.phone;
        if (profile.email) currentUser.email = profile.email;
      }

      // 2. Fetch Account from 'accounts' table
      const { data: account } = await sb.from('accounts').select('*').eq('user_id', user.id).maybeSingle();
      if (account) {
        currentBalance = parseFloat(account.balance || 0);
        currentUser.accountNo = account.account_number || account.accountNo || currentUser.accountNo;
      } else {
        // Create initial account row in Supabase if not found
        const newAccNo = '7890-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000);
        currentUser.accountNo = newAccNo;
        currentBalance = 0;
        await sb.from('accounts').insert([{
          user_id: user.id,
          account_number: newAccNo,
          balance: 0
        }]);
      }

      // 3. Fetch Transactions from 'transactions' table
      const { data: txList } = await sb.from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (txList && Array.isArray(txList)) {
        mutations = txList.map(t => ({
          id: t.id || ('TX-' + Date.now()),
          date: t.created_at ? new Date(t.created_at).toLocaleString('id-ID') : (t.date || new Date().toLocaleString('id-ID')),
          type: t.type || 'Transaksi',
          desc: t.description || t.desc || '',
          amount: parseFloat(t.amount || 0),
          isIncome: t.is_income !== undefined ? t.is_income : (t.isIncome !== undefined ? t.isIncome : true),
          status: t.status || 'Berhasil'
        }));
      }
    } catch (err) {
      console.warn("Supabase fetch user data note:", err);
    }
  }

  saveState();
}

/**
 * Initialize application state from Supabase or localStorage
 */
async function initAppState() {
  const sb = getSupabase();

  if (sb) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        await loadUserDataFromSupabase(session.user);
        localStorage.setItem(STORAGE_KEYS.LOGGED_IN, 'true');
        showDashboardView();
        return;
      }
    } catch (e) {
      console.warn("Supabase session check note:", e);
    }
  }

  const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
  } else {
    currentUser = DEFAULT_USER;
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
  }

  const storedBalance = localStorage.getItem(STORAGE_KEYS.BALANCE);
  if (storedBalance !== null) {
    currentBalance = parseFloat(storedBalance);
  } else {
    currentBalance = 0;
    localStorage.setItem(STORAGE_KEYS.BALANCE, '0');
  }

  const storedMutations = localStorage.getItem(STORAGE_KEYS.MUTATIONS);
  if (storedMutations) {
    mutations = JSON.parse(storedMutations);
  } else {
    mutations = [];
    localStorage.setItem(STORAGE_KEYS.MUTATIONS, JSON.stringify([]));
  }

  const isLoggedIn = localStorage.getItem(STORAGE_KEYS.LOGGED_IN) === 'true';
  if (isLoggedIn) {
    showDashboardView();
  } else {
    showLandingPage();
  }
}

/**
 * Save current state to localStorage
 */
function saveState() {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
  localStorage.setItem(STORAGE_KEYS.BALANCE, currentBalance.toString());
  localStorage.setItem(STORAGE_KEYS.MUTATIONS, JSON.stringify(mutations));
}


// --------------------------------------------------------------------------
// 2. DOM LOAD & LANDING PAGE INTERACTION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAppState();
  initStickyNavbar();
  initCounterAnimations();
  setupEventListeners();
});

/**
 * Sticky Navbar Handler on Scroll
 */
function initStickyNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Mobile menu drawer toggle & nav-actions handler
  const mobileToggle = document.getElementById('mobile-toggle');
  const navLinks = document.getElementById('nav-links');
  const navActions = document.querySelector('.nav-actions');
  const openLoginBtn = document.getElementById('open-login-btn');
  const openRegisterBtn = document.getElementById('open-register-btn');

  function handleMobileNav() {
    if (window.innerWidth <= 992) {
      if (openLoginBtn && openRegisterBtn && navLinks) {
        if (!navLinks.contains(openLoginBtn)) {
          navLinks.appendChild(openLoginBtn);
          navLinks.appendChild(openRegisterBtn);
        }
      }
    } else {
      if (openLoginBtn && openRegisterBtn && navActions && mobileToggle) {
        if (!navActions.contains(openLoginBtn)) {
          navActions.insertBefore(openLoginBtn, mobileToggle);
          navActions.insertBefore(openRegisterBtn, mobileToggle);
        }
      }
    }
  }

  window.addEventListener('resize', handleMobileNav);
  handleMobileNav();

  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      if (navLinks) navLinks.classList.toggle('active');
    });
  }

  // Close mobile menu when clicking any nav link or action button inside menu
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-link') || e.target.closest('#nav-links .btn')) {
      if (navLinks && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
      }
    }
  });
}

/**
 * Animated Counter Statistics Logic
 */
function initCounterAnimations() {
  const statNumbers = document.querySelectorAll('.stat-number');
  if (!statNumbers.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = entry.target;
        const targetValue = parseFloat(target.getAttribute('data-target'));
        const suffix = target.getAttribute('data-suffix') || '';
        const isDecimal = targetValue % 1 !== 0;

        let startValue = 0;
        const duration = 2000;
        const steps = 60;
        const increment = targetValue / steps;
        const stepTime = duration / steps;

        const timer = setInterval(() => {
          startValue += increment;
          if (startValue >= targetValue) {
            startValue = targetValue;
            clearInterval(timer);
          }

          if (isDecimal) {
            target.textContent = startValue.toFixed(1).replace('.', ',') + suffix;
          } else {
            target.textContent = Math.floor(startValue).toLocaleString('id-ID') + (targetValue >= 1000 ? '+' : '');
          }
        }, stepTime);

        obs.unobserve(target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(stat => observer.observe(stat));
}


// --------------------------------------------------------------------------
// 3. AUTH MODAL & LOGOUT LOGIC
// --------------------------------------------------------------------------
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');

function openLoginModal() {
  closeModals();
  loginModal.classList.add('active');
}

function openRegisterModal() {
  closeModals();
  registerModal.classList.add('active');
}

function closeModals() {
  if (loginModal) loginModal.classList.remove('active');
  if (registerModal) registerModal.classList.remove('active');
}

/**
 * Setup All Form Event Listeners
 */
function setupEventListeners() {
  document.getElementById('open-login-btn')?.addEventListener('click', openLoginModal);
  document.getElementById('open-register-btn')?.addEventListener('click', openRegisterModal);
  // Login Form Submission with Supabase
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username').value.trim();
      const passwordInput = document.getElementById('login-password').value;

      const sb = getSupabase();
      if (sb) {
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const { data, error } = await sb.auth.signInWithPassword({
            email: usernameInput,
            password: passwordInput
          });

          if (error) {
            showToast(`Login gagal: ${error.message}`, 'error');
            if (submitBtn) submitBtn.disabled = false;
            return;
          }

          if (data && data.user) {
            await loadUserDataFromSupabase(data.user);
          }
        } catch (err) {
          showToast(`Terjadi kesalahan login: ${err.message}`, 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (submitBtn) submitBtn.disabled = false;
      } else {
        currentUser.name = usernameInput.split('@')[0];
      }

      localStorage.setItem(STORAGE_KEYS.LOGGED_IN, 'true');
      saveState();
      closeModals();
      showDashboardView();
      showToast(`Login berhasil! Selamat datang, ${currentUser.name}.`, 'success');
    });
  }

  // Register Form Submission with Supabase
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const phone = document.getElementById('reg-phone').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirmPassword = document.getElementById('reg-confirm-password').value;

      if (password !== confirmPassword) {
        showToast('Konfirmasi password tidak cocok!', 'error');
        return;
      }

      const sb = getSupabase();
      if (sb) {
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const { data, error } = await sb.auth.signUp({
            email: email,
            password: password,
            options: {
              data: { full_name: name, phone: phone }
            }
          });

          if (error) {
            showToast(`Gagal mendaftar: ${error.message}`, 'error');
            if (submitBtn) submitBtn.disabled = false;
            return;
          }

          const user = data?.user;
          if (user) {
            const randomAcc = '7890-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000);

            // Insert into 'profiles' table
            try {
              await sb.from('profiles').insert([{
                id: user.id,
                full_name: name,
                email: email,
                phone: phone
              }]);
            } catch (pe) {
              console.warn("Profiles table insert note:", pe);
            }

            // Insert into 'accounts' table
            try {
              await sb.from('accounts').insert([{
                user_id: user.id,
                account_number: randomAcc,
                balance: 0
              }]);
            } catch (ae) {
              console.warn("Accounts table insert note:", ae);
            }

            await loadUserDataFromSupabase(user);
          }
        } catch (err) {
          showToast(`Terjadi kesalahan: ${err.message}`, 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
        if (submitBtn) submitBtn.disabled = false;
      } else {
        const randomAcc = '7890-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.floor(1000 + Math.random() * 9000);
        currentUser = { name, email, phone, accountNo: randomAcc };
        currentBalance = 0;
        mutations = [];
      }

      localStorage.setItem(STORAGE_KEYS.LOGGED_IN, 'true');
      saveState();
      closeModals();
      showDashboardView();
      showToast('Rekening baru berhasil dibuat di Supabase! Silakan lakukan Top Up.', 'success');
    });
  }

  // Top Up Form Submission
  const topupForm = document.getElementById('topup-form');
  if (topupForm) {
    topupForm.addEventListener('submit', handleTopUpSubmit);
  }

  // Transfer Form Submission
  const transferForm = document.getElementById('transfer-form');
  if (transferForm) {
    transferForm.addEventListener('submit', handleTransferSubmit);
  }

  // Bill Form Submission
  const billForm = document.getElementById('bill-form');
  if (billForm) {
    billForm.addEventListener('submit', handleBillSubmit);
  }
}

/**
 * Logout User
 */
async function handleLogout() {
  const sb = getSupabase();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (e) {
      console.warn("Signout note:", e);
    }
  }
  localStorage.setItem(STORAGE_KEYS.LOGGED_IN, 'false');
  showLandingPage();
  showToast('Anda telah berhasil keluar dari akun Lien\'s Bank.', 'warning');
}


// --------------------------------------------------------------------------
// 4. VIEW CONTROLLER (LANDING PAGE vs DASHBOARD)
// --------------------------------------------------------------------------
function showLandingPage() {
  document.getElementById('landing-page').style.display = 'block';
  document.getElementById('app-dashboard').classList.remove('active');
  window.scrollTo(0, 0);
}

function showDashboardView() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('app-dashboard').classList.add('active');
  updateDashboardUI();
}

/**
 * Format Currency to Indonesian Rupiah (Rp X.XXX.XXX)
 */
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Update UI Elements with Current State & Check Balance Rules
 */
function updateDashboardUI() {
  // Update Profile & Greeting texts
  const userNameElem = document.getElementById('dash-user-name');
  const userHeaderName = document.getElementById('dash-header-name');
  const userAvatar = document.getElementById('dash-user-avatar');
  const accountNoElem = document.getElementById('dash-account-no');
  const balanceDisplay = document.getElementById('dash-balance-display');

  if (userNameElem) userNameElem.textContent = currentUser.name;
  if (userHeaderName) userHeaderName.textContent = currentUser.name;
  if (userAvatar) userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
  if (accountNoElem) accountNoElem.textContent = currentUser.accountNo;
  if (balanceDisplay) balanceDisplay.textContent = formatRupiah(currentBalance);

  // Date String in Indonesian
  const now = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('id-ID', dateOptions);
  const dateElem = document.getElementById('dash-date-string');
  if (dateElem) dateElem.textContent = dateStr;

  // Update Tab Saldo UI
  const tabSaldoAmount = document.getElementById('tab-saldo-amount');
  const tabSaldoAccNo = document.getElementById('tab-saldo-acc-no');
  const tabSaldoStatus = document.getElementById('tab-saldo-feature-status');

  if (tabSaldoAmount) tabSaldoAmount.textContent = formatRupiah(currentBalance);
  if (tabSaldoAccNo) tabSaldoAccNo.textContent = currentUser.accountNo;

  if (tabSaldoStatus) {
    if (currentBalance > 0) {
      tabSaldoStatus.textContent = "Aktif (Seluruh Fitur Bebas Bertransaksi)";
      tabSaldoStatus.style.color = "#10b981";
    } else {
      tabSaldoStatus.textContent = "Nonaktif (Perlu Top Up Min. Rp50.000)";
      tabSaldoStatus.style.color = "#ef4444";
    }
  }

  // Update Available Balances in Forms
  const transferAvail = document.getElementById('transfer-available-balance');
  const billAvail = document.getElementById('bill-available-balance');
  if (transferAvail) transferAvail.textContent = formatRupiah(currentBalance);
  if (billAvail) billAvail.textContent = formatRupiah(currentBalance);

  // Update Profile Tab UI
  document.getElementById('prof-name').textContent = currentUser.name;
  document.getElementById('prof-account-no').textContent = currentUser.accountNo;
  document.getElementById('prof-email').textContent = currentUser.email;
  document.getElementById('prof-phone').textContent = currentUser.phone;

  // RULE CHECK: Disable/Lock Transfer & Bayar Tagihan if Balance is 0
  const isBalanceZero = currentBalance === 0;

  const menuTransfer = document.getElementById('menu-transfer');
  const menuTagihan = document.getElementById('menu-tagihan');
  const lockBadgeTransfer = document.getElementById('lock-badge-transfer');
  const lockBadgeTagihan = document.getElementById('lock-badge-tagihan');

  if (isBalanceZero) {
    menuTransfer?.classList.add('disabled');
    menuTagihan?.classList.add('disabled');
    if (lockBadgeTransfer) lockBadgeTransfer.style.display = 'inline-block';
    if (lockBadgeTagihan) lockBadgeTagihan.style.display = 'inline-block';
  } else {
    menuTransfer?.classList.remove('disabled');
    menuTagihan?.classList.remove('disabled');
    if (lockBadgeTransfer) lockBadgeTransfer.style.display = 'none';
    if (lockBadgeTagihan) lockBadgeTagihan.style.display = 'none';
  }

  // Render Mutations Tables
  renderMutations();
}


// --------------------------------------------------------------------------
// 5. SYSTEM RULES & RESTRICTED MENU NAVIGATION
// --------------------------------------------------------------------------
/**
 * Handles menu item click with Zero Balance Restriction Check
 */
function handleRestrictedClick(tabId) {
  if (currentBalance === 0) {
    showToast("Silakan lakukan Top Up minimal Rp50.000 terlebih dahulu.", "warning");
  } else {
    switchTab(tabId);
  }
}

/**
 * Tab Navigation Controller
 */
function switchTab(tabId) {
  // Deactivate all sidebar items
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  sidebarLinks.forEach(link => link.classList.remove('active'));

  // Activate matching sidebar item
  const activeLink = document.querySelector(`.sidebar-link[data-tab="${tabId}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Hide all tab contents
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(tab => tab.classList.remove('active'));

  // Show active tab
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.add('active');
  }

  // Close mobile sidebar if open
  document.querySelector('.sidebar')?.classList.remove('mobile-open');
}


// --------------------------------------------------------------------------
// 6. BUSINESS TRANSACTIONS (TOP UP, TRANSFER, BAYAR TAGIHAN)
// --------------------------------------------------------------------------

/**
 * Handle Quick Amount Chips selection in Top Up Tab
 */
function selectQuickAmount(amount) {
  const input = document.getElementById('topup-amount');
  if (input) input.value = amount;

  const chips = document.querySelectorAll('.amount-chip');
  chips.forEach(c => c.classList.remove('selected'));
  event.target.classList.add('selected');
}

/**
 * TOP UP FUNCTIONALITY
 * Rules: Minimum Top Up is Rp50.000. If < 50k, error message. If success, increase balance and unlock features.
 */
/**
 * TOP UP FUNCTIONALITY
 * Rules: Minimum Top Up is Rp50.000. If < 50k, error message. Updates Supabase accounts & transactions tables.
 */
async function handleTopUpSubmit(e) {
  e.preventDefault();
  const amountInput = document.getElementById('topup-amount');
  const methodSelect = document.getElementById('topup-method');
  const nominal = parseFloat(amountInput.value);

  // RULE CHECK: Minimum Top Up Rp50.000
  if (isNaN(nominal) || nominal < 50000) {
    showToast("Minimal Top Up adalah Rp50.000.", "error");
    return;
  }

  // Process Successful Top Up
  const newBalance = currentBalance + nominal;
  currentBalance = newBalance;
  const descText = `Top Up Saldo via ${methodSelect.value}`;

  // Supabase Sync
  const sb = getSupabase();
  if (sb && currentUser && currentUser.id) {
    try {
      // Update 'accounts' table balance
      await sb.from('accounts')
        .update({ balance: newBalance })
        .eq('user_id', currentUser.id);

      // Insert into 'transactions' table
      await sb.from('transactions').insert([{
        user_id: currentUser.id,
        type: 'Top Up Saldo',
        description: descText,
        amount: nominal,
        is_income: true,
        status: 'Berhasil'
      }]);
    } catch (err) {
      console.warn("Supabase Top Up sync note:", err);
    }
  }

  // Create Local Mutation Record
  const newMutation = {
    id: 'TX-' + Date.now(),
    date: new Date().toLocaleString('id-ID'),
    type: 'Top Up Saldo',
    desc: descText,
    amount: nominal,
    isIncome: true,
    status: 'Berhasil'
  };

  mutations.unshift(newMutation);
  saveState();
  updateDashboardUI();

  // Reset form
  amountInput.value = '';
  showToast(`Top Up sebesar ${formatRupiah(nominal)} berhasil! Seluruh fitur transaksi kini aktif.`, "success");

  // Switch to main dashboard overview
  setTimeout(() => switchTab('tab-dashboard'), 1200);
}

/**
 * TRANSFER FUNCTIONALITY
 * Rules: Requires sufficient balance. Automatically deducts balance and syncs with Supabase.
 */
async function handleTransferSubmit(e) {
  e.preventDefault();

  // Double check balance restriction
  if (currentBalance === 0) {
    showToast("Silakan lakukan Top Up minimal Rp50.000 terlebih dahulu.", "warning");
    return;
  }

  const bank = document.getElementById('transfer-bank').value;
  const accNo = document.getElementById('transfer-account').value.trim();
  const amountInput = document.getElementById('transfer-amount');
  const noteInput = document.getElementById('transfer-note');
  const nominal = parseFloat(amountInput.value);

  if (isNaN(nominal) || nominal <= 0) {
    showToast("Masukkan nominal transfer yang valid.", "error");
    return;
  }

  if (nominal > currentBalance) {
    showToast("Saldo tidak mencukupi untuk melakukan transfer ini.", "error");
    return;
  }

  // Deduct Balance
  const newBalance = currentBalance - nominal;
  currentBalance = newBalance;

  const note = noteInput.value.trim() ? ` (${noteInput.value.trim()})` : '';
  const descText = `Transfer ke ${bank} - ${accNo}${note}`;

  // Supabase Sync
  const sb = getSupabase();
  if (sb && currentUser && currentUser.id) {
    try {
      // Update 'accounts' table balance
      await sb.from('accounts')
        .update({ balance: newBalance })
        .eq('user_id', currentUser.id);

      // Insert into 'transactions' table
      await sb.from('transactions').insert([{
        user_id: currentUser.id,
        type: 'Transfer Dana',
        description: descText,
        amount: nominal,
        is_income: false,
        status: 'Berhasil'
      }]);
    } catch (err) {
      console.warn("Supabase Transfer sync note:", err);
    }
  }

  // Log Mutation
  const newMutation = {
    id: 'TX-' + Date.now(),
    date: new Date().toLocaleString('id-ID'),
    type: 'Transfer Dana',
    desc: descText,
    amount: nominal,
    isIncome: false,
    status: 'Berhasil'
  };

  mutations.unshift(newMutation);
  saveState();
  updateDashboardUI();

  // Reset form
  amountInput.value = '';
  document.getElementById('transfer-account').value = '';
  noteInput.value = '';

  showToast(`Transfer sebesar ${formatRupiah(nominal)} ke ${bank} (${accNo}) berhasil!`, "success");
  setTimeout(() => switchTab('tab-dashboard'), 1200);
}

/**
 * BILL PAYMENT CATEGORY SELECTOR
 */
function selectBillCategory(type, iconClass) {
  document.getElementById('bill-type').value = type;

  const items = document.querySelectorAll('.bill-cat-item');
  items.forEach(i => i.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  const label = document.getElementById('bill-customer-label');
  const icon = document.getElementById('bill-customer-icon');

  if (label) label.textContent = `ID Pelanggan / Nomor Tagihan ${type}`;
  if (icon) icon.className = `fa-solid ${iconClass}`;
}

/**
 * BILL PAYMENT SUBMISSION
 */
async function handleBillSubmit(e) {
  e.preventDefault();

  if (currentBalance === 0) {
    showToast("Silakan lakukan Top Up minimal Rp50.000 terlebih dahulu.", "warning");
    return;
  }

  const billType = document.getElementById('bill-type').value;
  const customerId = document.getElementById('bill-customer-id').value.trim();
  const amountInput = document.getElementById('bill-amount');
  const nominal = parseFloat(amountInput.value);

  if (isNaN(nominal) || nominal <= 0) {
    showToast("Masukkan nominal tagihan yang valid.", "error");
    return;
  }

  if (nominal > currentBalance) {
    showToast("Saldo tidak mencukupi untuk membayar tagihan ini.", "error");
    return;
  }

  // Deduct Balance
  const newBalance = currentBalance - nominal;
  currentBalance = newBalance;
  const descText = `Pembayaran ${billType} - ID ${customerId}`;

  // Supabase Sync
  const sb = getSupabase();
  if (sb && currentUser && currentUser.id) {
    try {
      await sb.from('accounts')
        .update({ balance: newBalance })
        .eq('user_id', currentUser.id);

      await sb.from('transactions').insert([{
        user_id: currentUser.id,
        type: 'Pembayaran Tagihan',
        description: descText,
        amount: nominal,
        is_income: false,
        status: 'Berhasil'
      }]);
    } catch (err) {
      console.warn("Supabase Bill Payment sync note:", err);
    }
  }

  // Log Mutation
  const newMutation = {
    id: 'TX-' + Date.now(),
    date: new Date().toLocaleString('id-ID'),
    type: 'Pembayaran Tagihan',
    desc: descText,
    amount: nominal,
    isIncome: false,
    status: 'Berhasil'
  };

  mutations.unshift(newMutation);
  saveState();
  updateDashboardUI();

  // Reset Form
  amountInput.value = '';
  document.getElementById('bill-customer-id').value = '';

  showToast(`Pembayaran ${billType} sebesar ${formatRupiah(nominal)} berhasil!`, "success");
  setTimeout(() => switchTab('tab-dashboard'), 1200);
}


// --------------------------------------------------------------------------
// 7. MUTASI REKENING RENDER & DOWNLOAD EXPORT CSV
// --------------------------------------------------------------------------
function renderMutations() {
  const recentBody = document.getElementById('recent-mutations-body');
  const fullBody = document.getElementById('full-mutations-body');

  if (!mutations.length) {
    const emptyRow = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 24px;">Belum ada riwayat transaksi.</td></tr>`;
    if (recentBody) recentBody.innerHTML = emptyRow;
    if (fullBody) fullBody.innerHTML = emptyRow;
    return;
  }

  // Render Full Table Rows
  let fullRowsHTML = '';
  mutations.forEach(m => {
    const amountClass = m.isIncome ? 'amount-plus' : 'amount-minus';
    const amountPrefix = m.isIncome ? '+ ' : '- ';

    fullRowsHTML += `
      <tr>
        <td>${m.date}</td>
        <td><strong>${m.type}</strong></td>
        <td>${m.desc}</td>
        <td class="${amountClass}">${amountPrefix}${formatRupiah(m.amount)}</td>
        <td><span class="badge-gold" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-check"></i> ${m.status}</span></td>
      </tr>
    `;
  });

  if (fullBody) fullBody.innerHTML = fullRowsHTML;

  // Render Top 5 Recent Rows
  let recentRowsHTML = '';
  mutations.slice(0, 5).forEach(m => {
    const amountClass = m.isIncome ? 'amount-plus' : 'amount-minus';
    const amountPrefix = m.isIncome ? '+ ' : '- ';

    recentRowsHTML += `
      <tr>
        <td>${m.date}</td>
        <td><strong>${m.type}</strong></td>
        <td>${m.desc}</td>
        <td class="${amountClass}">${amountPrefix}${formatRupiah(m.amount)}</td>
        <td><span class="badge-gold" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-check"></i> ${m.status}</span></td>
      </tr>
    `;
  });

  if (recentBody) recentBody.innerHTML = recentRowsHTML;
}

/**
 * CSV EXPORT DOWNLOAD FUNCTION
 * Formats mutasi rekening into standard CSV format with BOM for Indonesian Excel compatibility.
 */
function downloadMutasiCSV() {
  if (!mutations.length) {
    showToast("Belum ada riwayat mutasi untuk diunduh.", "warning");
    return;
  }

  let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
  csvContent += "ID Transaksi,Tanggal & Waktu,Jenis Transaksi,Deskripsi,Nominal (IDR),Tipe,Status\n";

  mutations.forEach(m => {
    const typeLabel = m.isIncome ? "KREDIT" : "DEBET";
    const cleanDesc = `"${m.desc.replace(/"/g, '""')}"`;
    csvContent += `"${m.id}","${m.date}","${m.type}",${cleanDesc},${m.amount},"${typeLabel}","${m.status}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.setAttribute("href", url);
  downloadLink.setAttribute("download", `Mutasi_Rekening_LiensBank_${currentUser.name.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  showToast("File Mutasi Rekening berhasil diunduh!", "success");
}


// --------------------------------------------------------------------------
// 8. TOAST NOTIFICATION UTILITY
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';
  if (type === 'warning') icon = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
