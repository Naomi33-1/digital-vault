// ===== МОДУЛЬ ШИФРОВАНИЯ =====
const CryptoModule = {
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(16));
    },
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async encrypt(data, password) {
        const salt = this.generateSalt();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const encoder = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(JSON.stringify(data)));
        return { salt: Array.from(salt), iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    },
    async decrypt(encryptedObj, password) {
        const salt = new Uint8Array(encryptedObj.salt);
        const iv = new Uint8Array(encryptedObj.iv);
        const data = new Uint8Array(encryptedObj.data);
        const key = await this.deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
    }
};

// ===== МОДУЛЬ ХРАНЕНИЯ =====
const StorageModule = {
    saveVault(v) { localStorage.setItem('digitalVault', JSON.stringify(v)); },
    loadVault() { const d = localStorage.getItem('digitalVault'); return d ? JSON.parse(d) : null; },
    hasVault() { return localStorage.getItem('digitalVault') !== null; },
    saveHistory(action, details) {
        const h = JSON.parse(localStorage.getItem('vaultHistory') || '[]');
        h.unshift({ date: new Date().toISOString(), action, details });
        if (h.length > 100) h.length = 100;
        localStorage.setItem('vaultHistory', JSON.stringify(h));
    },
    getHistory() { return JSON.parse(localStorage.getItem('vaultHistory') || '[]'); },
    savePins(p) { localStorage.setItem('vaultPins', JSON.stringify(p)); },
    loadPins() { return JSON.parse(localStorage.getItem('vaultPins') || '[]'); }
};

// ===== АНАЛИЗ ПАРОЛЯ =====
function analyzePasswordStrength(password) {
    let score = 0, feedback = [];
    if (password.length >= 8) score += 1; else feedback.push('Минимум 8 символов');
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    if (/[a-z]/.test(password)) score += 1; else feedback.push('Добавьте строчные буквы');
    if (/[A-Z]/.test(password)) score += 1; else feedback.push('Добавьте заглавные буквы');
    if (/[0-9]/.test(password)) score += 1; else feedback.push('Добавьте цифры');
    if (/[^A-Za-z0-9]/.test(password)) score += 1; else feedback.push('Добавьте спецсимволы');
    let strength, color;
    if (score <= 2) { strength = 'Слабый'; color = '#ef4444'; }
    else if (score <= 4) { strength = 'Средний'; color = '#f59e0b'; }
    else if (score <= 5) { strength = 'Хороший'; color = '#3b82f6'; }
    else { strength = 'Надёжный'; color = '#22c55e'; }
    return { score, strength, color, feedback };
}

function getCategoryName(cat) {
    const names = { social: '💬 Соцсети', email: '📦 Почта', bank: '🏦 Банки', work: '💼 Работа', other: ' Другое' };
    return names[cat] || ' Другое';
}

function formatDate(d) {
    return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ===== ГЛАВНЫЙ КОМПОНЕНТ =====
function App() {
    const [masterPassword, setMasterPassword] = React.useState('');
    const [isUnlocked, setIsUnlocked] = React.useState(false);
    const [passwords, setPasswords] = React.useState([]);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [categoryFilter, setCategoryFilter] = React.useState('all');
    const [showModal, setShowModal] = React.useState(false);
    const [editingPassword, setEditingPassword] = React.useState(null);
    const [notification, setNotification] = React.useState(null);
    const [isFirstTime, setIsFirstTime] = React.useState(!StorageModule.hasVault());
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [recoveryKey, setRecoveryKey] = React.useState('');
    const [showRecoveryKey, setShowRecoveryKey] = React.useState(false);
    const [showRecoveryInput, setShowRecoveryInput] = React.useState(false);
    const [recoveryInput, setRecoveryInput] = React.useState('');
    const [showExportMenu, setShowExportMenu] = React.useState(false);
    const [darkMode, setDarkMode] = React.useState(true);
    const [showHistory, setShowHistory] = React.useState(false);
    const [history, setHistory] = React.useState([]);
    const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);
    const [showPinGenerator, setShowPinGenerator] = React.useState(false);
    const [pins, setPins] = React.useState(StorageModule.loadPins());
    const [visiblePins, setVisiblePins] = React.useState({});
    const [pinLength, setPinLength] = React.useState(4);
    const [generatedPin, setGeneratedPin] = React.useState('');
    const [manualPin, setManualPin] = React.useState('');
    const [pinName, setPinName] = React.useState('');
    const [autoLockTime] = React.useState(10);
    const [lastActivity, setLastActivity] = React.useState(Date.now());

    // Автоблокировка
    React.useEffect(() => {
        if (!isUnlocked) return;
        const interval = setInterval(() => {
            if ((Date.now() - lastActivity) / 1000 / 60 >= autoLockTime) {
                handleLock();
                showNotification('Сейф заблокирован (неактивность 10 мин)');
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [isUnlocked, lastActivity]);

    React.useEffect(() => {
        if (!isUnlocked) return;
        const update = () => setLastActivity(Date.now());
        window.addEventListener('mousemove', update);
        window.addEventListener('keypress', update);
        window.addEventListener('click', update);
        return () => {
            window.removeEventListener('mousemove', update);
            window.removeEventListener('keypress', update);
            window.removeEventListener('click', update);
        };
    }, [isUnlocked]);

    React.useEffect(() => {
        const close = () => setShowExportMenu(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, []);

    React.useEffect(() => {
        document.body.className = darkMode ? 'dark-theme' : 'light-theme';
    }, [darkMode]);

    const showNotification = (message, isError = false) => {
        setNotification({ message, isError });
        setTimeout(() => setNotification(null), 3000);
    };

    const generateRecoveryKey = () => {
        const words = ['звезда', 'луна', 'солнце', 'река', 'гора', 'лес', 'море', 'небо', 'огонь', 'ветер', 'дождь', 'снег', 'цветок', 'дерево', 'камень', 'птица'];
        return Array.from({ length: 6 }, () => words[Math.floor(Math.random() * words.length)]).join('-');
    };

    const handleUnlock = async (e) => {
        e.preventDefault();
        if (isFirstTime) {
            if (masterPassword.length < 6) { showNotification('Минимум 6 символов', true); return; }
            if (masterPassword !== confirmPassword) { showNotification('Пароли не совпадают', true); return; }
            const key = generateRecoveryKey();
            setRecoveryKey(key);
            setShowRecoveryKey(true);
            const encrypted = await CryptoModule.encrypt([], masterPassword);
            encrypted.recoveryKey = key;
            StorageModule.saveVault(encrypted);
            setIsFirstTime(false);
            setPasswords([]);
            setIsUnlocked(true);
            setLastActivity(Date.now());
            StorageModule.saveHistory('Создание сейфа', 'Новый сейф создан');
            showNotification('Сейф создан! Сохраните ключ восстановления!');
        } else {
            try {
                const vault = StorageModule.loadVault();
                const decrypted = await CryptoModule.decrypt(vault, masterPassword);
                setPasswords(decrypted);
                setIsUnlocked(true);
                setLastActivity(Date.now());
                setHistory(StorageModule.getHistory());
                StorageModule.saveHistory('Вход в сейф', 'Пользователь разблокировал сейф');
                showNotification('Сейф разблокирован!');
            } catch (e) { showNotification('Неверный мастер-пароль', true); }
        }
    };

    const handleRecovery = async (e) => {
        e.preventDefault();
        const vault = StorageModule.loadVault();
        if (vault.recoveryKey === recoveryInput) {
            const newPass = prompt('Введите новый мастер-пароль:');
            if (newPass && newPass.length >= 6) {
                const encrypted = await CryptoModule.encrypt([], newPass);
                encrypted.recoveryKey = vault.recoveryKey;
                StorageModule.saveVault(encrypted);
                StorageModule.saveHistory('Восстановление', 'Мастер-пароль изменён');
                showNotification('Пароль изменён! Войдите заново.');
                setShowRecoveryInput(false);
                setRecoveryInput('');
            }
        } else { showNotification('Неверный ключ восстановления', true); }
    };

    const savePasswords = async (newPasswords) => {
        const vault = StorageModule.loadVault();
        const encrypted = await CryptoModule.encrypt(newPasswords, masterPassword);
        encrypted.recoveryKey = vault.recoveryKey;
        StorageModule.saveVault(encrypted);
        setPasswords(newPasswords);
    };

    const handleSavePassword = async (passwordData) => {
        let newPasswords;
        if (editingPassword) {
            newPasswords = passwords.map(p => p.id === editingPassword.id ? { ...p, ...passwordData } : p);
            StorageModule.saveHistory('Редактирование', `Изменён: ${passwordData.title}`);
            showNotification('Пароль обновлён!');
        } else {
            newPasswords = [...passwords, { ...passwordData, id: Date.now(), favorite: false }];
            StorageModule.saveHistory('Добавление', `Добавлен: ${passwordData.title}`);
            showNotification('Пароль добавлен!');
        }
        await savePasswords(newPasswords);
        setShowModal(false);
        setEditingPassword(null);
    };

    const handleDeletePassword = async (id) => {
        const p = passwords.find(x => x.id === id);
        if (confirm(`Удалить "${p?.title}"?`)) {
            const newPasswords = passwords.filter(x => x.id !== id);
            await savePasswords(newPasswords);
            StorageModule.saveHistory('Удаление', `Удалён: ${p?.title}`);
            showNotification('Пароль удалён!');
        }
    };

    const toggleFavorite = async (id) => {
        const p = passwords.find(x => x.id === id);
        const newPasswords = passwords.map(x => x.id === id ? { ...x, favorite: !x.favorite } : x);
        await savePasswords(newPasswords);
        StorageModule.saveHistory(p.favorite ? 'Удалено из избранного' : 'Добавлено в избранное', p.title);
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        showNotification(`${label} скопирован!`);
        setLastActivity(Date.now());
    };

    const handleExportJSON = () => {
        const vault = StorageModule.loadVault();
        const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `digital-vault-${new Date().toISOString().split('T')[0]}.json`;
        a.click(); URL.revokeObjectURL(url);
        StorageModule.saveHistory('Экспорт', 'Резервная копия JSON');
        showNotification('Резервная копия создана!');
    };

    const handleExportCSV = () => {
        const BOM = '\uFEFF';
        const headers = 'Название;Логин/Email;Пароль;Сайт;Категория;Избранное\n';
        const rows = passwords.map(p => `"${p.title}";"${p.username}";"${p.password}";"${p.url || ''}";"${getCategoryName(p.category)}";"${p.favorite ? 'Да' : 'Нет'}"`).join('\n');
        const blob = new Blob([BOM + headers + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `passwords-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
        showNotification('Экспорт в Excel создан!');
    };

    const handleExportHTML = () => {
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Мои пароли</title>
        <style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#333}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:12px;text-align:left}th{background:#667eea;color:white}tr:nth-child(even){background:#f2f2f2}.warning{color:red;font-size:12px;margin-top:20px}.print-instruction{background:#fff3cd;padding:15px;border-radius:8px;margin:20px 0;border-left:4px solid #ffc107}@media print{.print-instruction{display:none}}</style></head>
        <body><h1>🔐 Мои пароли - ${new Date().toLocaleDateString('ru-RU')}</h1><p>Всего записей: ${passwords.length}</p>
        <div class="print-instruction"><strong>📄 Как распечатать:</strong><br>Нажмите <strong>Ctrl + P</strong> (или Файл → Печать) для печати этого документа.</div>
        <table><tr><th>Название</th><th>Логин/Email</th><th>Пароль</th><th>Сайт</th><th>Категория</th><th>Избранное</th></tr>
        ${passwords.map(p => `<tr><td>${p.title}</td><td>${p.username}</td><td>${p.password}</td><td>${p.url || '-'}</td><td>${getCategoryName(p.category)}</td><td>${p.favorite ? '⭐' : ''}</td></tr>`).join('')}
        </table><p class="warning">⚠️ ВНИМАНИЕ: Этот документ содержит пароли в открытом виде! Храните в безопасном месте!</p></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `passwords-${new Date().toISOString().split('T')[0]}.html`;
        a.click(); URL.revokeObjectURL(url);
        showNotification('HTML файл создан!');
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                StorageModule.saveVault(JSON.parse(event.target.result));
                StorageModule.saveHistory('Импорт', 'Импортирован сейф из файла');
                showNotification('Сейф импортирован! Перезагрузите страницу.');
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) { showNotification('Ошибка импорта', true); }
        };
        reader.readAsText(file);
    };

    const handleLock = () => {
        StorageModule.saveHistory('Выход', 'Сейф заблокирован');
        setIsUnlocked(false);
        setMasterPassword('');
        setConfirmPassword('');
        setPasswords([]);
        showNotification('Сейф заблокирован');
    };

    // PIN-коды
    const generatePin = () => {
        const array = new Uint32Array(pinLength);
        crypto.getRandomValues(array);
        setGeneratedPin(Array.from(array).map(n => n % 10).join(''));
    };

    const savePin = () => {
        const pinToSave = manualPin || generatedPin;
        if (!pinToSave) { showNotification('Введите или сгенерируйте PIN', true); return; }
        if (!pinName) { showNotification('Введите название (банк/карта)', true); return; }
        const newPins = [...pins, { id: Date.now(), name: pinName, pin: pinToSave, length: pinLength }];
        setPins(newPins);
        StorageModule.savePins(newPins);
        setManualPin('');
        setGeneratedPin('');
        setPinName('');
        showNotification('PIN-код сохранён!');
    };

    const deletePin = (id) => {
        if (confirm('Удалить этот PIN-код?')) {
            const newPins = pins.filter(p => p.id !== id);
            setPins(newPins);
            StorageModule.savePins(newPins);
            showNotification('PIN удалён!');
        }
    };

    const copyPin = (pin) => {
        navigator.clipboard.writeText(pin);
        showNotification('PIN скопирован!');
    };

    const togglePinVisibility = (id) => {
        setVisiblePins(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const filteredPasswords = passwords.filter(p => {
        const matchSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
        const matchFav = !showFavoritesOnly || p.favorite;
        return matchSearch && matchCat && matchFav;
    });

    // ===== ЭКРАН ВХОДА =====
    if (!isUnlocked) {
        if (showRecoveryKey) {
            return React.createElement('div', { className: 'login-screen' },
                React.createElement('div', { className: 'login-box' },
                    React.createElement('h1', null, '🔑 Ключ восстановления'),
                    React.createElement('p', { className: 'subtitle', style: { color: '#ef4444', fontWeight: 'bold' } }, '⚠️ СОХРАНИТЕ ЭТОТ КЛЮЧ!'),
                    React.createElement('div', { className: 'recovery-key-box' }, recoveryKey),
                    React.createElement('div', { className: 'info-box' }, React.createElement('p', null, '📋 Скопируйте ключ в надёжное место. Без него нельзя восстановить пароль!')),
                    React.createElement('button', { className: 'btn btn-primary', style: { marginTop: '20px' }, onClick: () => setShowRecoveryKey(false) }, '✅ Я сохранил ключ')
                )
            );
        }
        if (showRecoveryInput) {
            return React.createElement('div', { className: 'login-screen' },
                React.createElement('div', { className: 'login-box' },
                    React.createElement('h1', null, '🔑 Восстановление доступа'),
                    React.createElement('p', { className: 'subtitle' }, 'Введите ключ восстановления'),
                    React.createElement('form', { onSubmit: handleRecovery },
                        React.createElement('div', { className: 'form-group' },
                            React.createElement('label', null, 'Ключ восстановления'),
                            React.createElement('input', { type: 'text', value: recoveryInput, onChange: (e) => setRecoveryInput(e.target.value), placeholder: 'звезда-луна-солнце-...', required: true })
                        ),
                        React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, ' Восстановить'),
                        React.createElement('button', { type: 'button', className: 'btn btn-secondary', style: { marginTop: '10px', width: '100%' }, onClick: () => setShowRecoveryInput(false) }, '← Назад')
                    )
                )
            );
        }
        return React.createElement('div', { className: 'login-screen' },
            React.createElement('div', { className: 'login-box' },
                React.createElement('h1', null, '🔑 Цифровой Сейф'),
                React.createElement('p', { className: 'subtitle' }, isFirstTime ? 'Создание нового сейфа' : 'Децентрализованное хранилище паролей'),
                React.createElement('form', { onSubmit: handleUnlock },
                    React.createElement('div', { className: 'form-group' },
                        React.createElement('label', null, 'Мастер-пароль'),
                        React.createElement('input', { type: 'password', value: masterPassword, onChange: (e) => setMasterPassword(e.target.value), placeholder: 'Введите мастер-пароль', required: true })
                    ),
                    isFirstTime && React.createElement('div', { className: 'form-group' },
                        React.createElement('label', null, 'Подтвердите пароль'),
                        React.createElement('input', { type: 'password', value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), placeholder: 'Повторите пароль', required: true })
                    ),
                    React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, isFirstTime ? '🔐 Создать сейф' : '🔓 Разблокировать'),
                    !isFirstTime && React.createElement('button', { type: 'button', className: 'btn btn-secondary', style: { marginTop: '10px', width: '100%' }, onClick: () => setShowRecoveryInput(true) }, ' Забыли пароль?'),
                    React.createElement('div', { className: 'info-box' },
                        React.createElement('p', null, isFirstTime ? '⚠️ Запомните мастер-пароль!' : '🔒 AES-256-GCM | PBKDF2 | Без сервера | Без регистрации'),
                        React.createElement('p', { className: 'support-info' }, '📞 Техподдержка: +7 (927) 602-62-39 (создатель: Вагапова И.Ф.)')
                    )
                )
            )
        );
    }

    // ===== ГЛАВНЫЙ ЭКРАН =====
    return React.createElement('div', { className: 'container' },
        notification && React.createElement('div', { className: `notification ${notification.isError ? 'error' : ''}` }, notification.message),

        // История
        showHistory && React.createElement('div', { className: 'modal-overlay', onClick: () => setShowHistory(false) },
            React.createElement('div', { className: 'modal history-modal', style: { maxWidth: '600px' }, onClick: (e) => e.stopPropagation() },
                React.createElement('h2', null, '📜 История изменений'),
                React.createElement('div', { className: 'history-list' },
                    history.length === 0 ? React.createElement('p', { className: 'empty-text' }, 'История пуста')
                    : history.map((item, i) => React.createElement('div', { key: i, className: 'history-item' },
                        React.createElement('div', { className: 'history-date' }, formatDate(item.date)),
                        React.createElement('div', { className: 'history-action' }, item.action),
                        React.createElement('div', { className: 'history-details' }, item.details)
                    ))
                ),
                React.createElement('button', { className: 'btn btn-secondary', style: { marginTop: '20px', width: '100%' }, onClick: () => setShowHistory(false) }, 'Закрыть')
            )
        ),

        // PIN-коды
        showPinGenerator && React.createElement('div', { className: 'modal-overlay', onClick: () => setShowPinGenerator(false) },
            React.createElement('div', { className: 'modal pin-modal', style: { maxWidth: '550px' }, onClick: (e) => e.stopPropagation() },
                React.createElement('h2', null, '🔢 Менеджер PIN-кодов'),
                
                React.createElement('div', { className: 'pin-add-section' },
                    React.createElement('h3', { className: 'modal-section-title' }, '➕ Добавить PIN-код'),
                    React.createElement('div', { className: 'form-group' },
                        React.createElement('label', null, 'Название (банк/карта) *'),
                        React.createElement('input', { type: 'text', value: pinName, onChange: (e) => setPinName(e.target.value), placeholder: 'Например: Сбербанк ****1234' })
                    ),
                    React.createElement('div', { className: 'form-group' },
                        React.createElement('label', null, 'Длина PIN-кода'),
                        React.createElement('select', { value: pinLength, onChange: (e) => setPinLength(parseInt(e.target.value)), className: 'filter-select' },
                            React.createElement('option', { value: 4 }, '4 цифры (банковская карта)'),
                            React.createElement('option', { value: 6 }, '6 цифр (телефон)')
                        )
                    ),
                    React.createElement('div', { className: 'pin-buttons-row' },
                        React.createElement('button', { className: 'btn btn-primary', style: { flex: 1 }, onClick: generatePin }, '🎲 Сгенерировать'),
                        React.createElement('button', { className: 'btn btn-success', style: { flex: 1 }, onClick: savePin }, '💾 Сохранить')
                    ),
                    generatedPin && React.createElement('div', { className: 'generated-pin-display' }, generatedPin),
                    React.createElement('div', { className: 'form-group' },
                        React.createElement('label', null, 'Или введите PIN вручную'),
                        React.createElement('input', { type: 'password', value: manualPin, onChange: (e) => setManualPin(e.target.value), placeholder: 'Введите PIN-код', maxLength: pinLength })
                    )
                ),

                React.createElement('h3', { className: 'modal-section-title' }, ` Сохранённые PIN-коды (${pins.length})`),
                pins.length === 0 ? React.createElement('p', { className: 'empty-text' }, 'Нет сохранённых PIN-кодов')
                : React.createElement('div', { className: 'pins-list' },
                    pins.map(p => {
                        const isVisible = visiblePins[p.id];
                        return React.createElement('div', { key: p.id, className: 'pin-card-item' },
                            React.createElement('div', { className: 'pin-info' },
                                React.createElement('div', { className: 'pin-name' }, p.name),
                                React.createElement('div', { className: 'pin-value' }, 
                                    isVisible ? p.pin : '•'.repeat(p.pin.length)
                                )
                            ),
                            React.createElement('div', { className: 'pin-actions' },
                                React.createElement('button', { 
                                    className: 'btn btn-secondary btn-icon', 
                                    onClick: () => togglePinVisibility(p.id),
                                    title: isVisible ? 'Скрыть PIN' : 'Показать PIN'
                                }, isVisible ? '🙈' : '👁️'),
                                React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => copyPin(p.pin) }, '📋'),
                                React.createElement('button', { className: 'btn btn-danger btn-icon', onClick: () => deletePin(p.id) }, '🗑️')
                            )
                        );
                    })
                ),
                React.createElement('button', { className: 'btn btn-secondary', style: { marginTop: '20px', width: '100%' }, onClick: () => setShowPinGenerator(false) }, 'Закрыть')
            )
        ),

        // Шапка
        React.createElement('div', { className: 'header' },
            React.createElement('h1', null, '🔑 Мой Цифровой Сейф'),
            React.createElement('div', { className: 'header-actions' },
                React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => setDarkMode(!darkMode) }, darkMode ? '☀️' : '🌙'),
                React.createElement('div', { className: 'export-wrapper' },
                    React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: (e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); } }, '📤 Экспорт'),
                    showExportMenu && React.createElement('div', { className: 'export-menu', onClick: (e) => e.stopPropagation() },
                        React.createElement('button', { className: 'btn btn-secondary', style: { width: '100%', textAlign: 'left' }, onClick: () => { handleExportJSON(); setShowExportMenu(false); } }, '💾 JSON (резервная копия)'),
                        React.createElement('button', { className: 'btn btn-secondary', style: { width: '100%', textAlign: 'left' }, onClick: () => { handleExportCSV(); setShowExportMenu(false); } }, '📊 CSV (для Excel)'),
                        React.createElement('button', { className: 'btn btn-secondary', style: { width: '100%', textAlign: 'left' }, onClick: () => { handleExportHTML(); setShowExportMenu(false); } }, '📄 HTML (для Word/печати)')
                    )
                ),
                React.createElement('label', { className: 'btn btn-secondary btn-icon', style: { cursor: 'pointer' } }, '📥 Импорт', React.createElement('input', { type: 'file', accept: '.json', onChange: handleImport, style: { display: 'none' } })),
                React.createElement('button', { className: 'btn btn-danger btn-icon', onClick: handleLock }, '🔒 Заблокировать')
            )
        ),

        // Статистика
        React.createElement('div', { className: 'stats-grid' },
            React.createElement('div', { className: 'stat-card stat-total' },
                React.createElement('div', { className: 'stat-value' }, passwords.length),
                React.createElement('div', { className: 'stat-label' }, 'Всего паролей')
            ),
            React.createElement('div', { className: 'stat-card stat-strong' },
                React.createElement('div', { className: 'stat-value' }, passwords.filter(p => analyzePasswordStrength(p.password).score >= 5).length),
                React.createElement('div', { className: 'stat-label' }, 'Надёжных')
            ),
            React.createElement('div', { className: 'stat-card stat-weak' },
                React.createElement('div', { className: 'stat-value' }, passwords.filter(p => analyzePasswordStrength(p.password).score <= 2).length),
                React.createElement('div', { className: 'stat-label' }, 'Слабых')
            ),
            React.createElement('div', { className: 'stat-card stat-fav' },
                React.createElement('div', { className: 'stat-value' }, passwords.filter(p => p.favorite).length),
                React.createElement('div', { className: 'stat-label' }, 'В избранном')
            )
        ),

        // Панель управления
        React.createElement('div', { className: 'controls' },
            React.createElement('div', { className: 'search-box' },
                React.createElement('input', { type: 'text', placeholder: '🔍 Поиск...', value: searchQuery, onChange: (e) => setSearchQuery(e.target.value) })
            ),
            React.createElement('select', { className: 'filter-select', value: categoryFilter, onChange: (e) => setCategoryFilter(e.target.value) },
                React.createElement('option', { value: 'all' }, '📁 Все категории'),
                React.createElement('option', { value: 'social' }, '💬 Соцсети'),
                React.createElement('option', { value: 'email' }, '📦 Почта'),
                React.createElement('option', { value: 'bank' }, '🏦 Банки'),
                React.createElement('option', { value: 'work' }, '💼 Работа'),
                React.createElement('option', { value: 'other' }, ' Другое')
            ),
            React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowFavoritesOnly(!showFavoritesOnly) }, showFavoritesOnly ? '⭐ Избранное' : '☆ Избранное'),
            React.createElement('button', { className: 'btn btn-secondary', onClick: () => { setHistory(StorageModule.getHistory()); setShowHistory(true); } }, '📜 История'),
            React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowPinGenerator(true) }, '🔢 PIN-коды'),
            React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditingPassword(null); setShowModal(true); } }, '➕ Добавить пароль')
        ),

        // Список паролей
        filteredPasswords.length === 0
            ? React.createElement('div', { className: 'empty-state' },
                React.createElement('div', { className: 'icon' }, ''),
                React.createElement('h3', null, passwords.length === 0 ? 'Сейф пуст' : 'Ничего не найдено'),
                React.createElement('p', null, passwords.length === 0 ? 'Добавьте первый пароль' : 'Измените параметры поиска')
            )
            : React.createElement('div', { className: 'passwords-grid' },
                filteredPasswords.map(p => React.createElement('div', { key: p.id, className: 'password-card' },
                    React.createElement('div', { className: 'card-header' },
                        React.createElement('div', { className: 'card-title' }, p.favorite && React.createElement('span', { style: { marginRight: '8px' } }, '⭐'), p.title),
                        React.createElement('div', { className: 'card-category' }, getCategoryName(p.category))
                    ),
                    React.createElement('div', { className: 'card-field' },
                        React.createElement('label', null, 'Логин / Email'),
                        React.createElement('div', { className: 'card-field-value' },
                            React.createElement('span', null, p.username),
                            React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => copyToClipboard(p.username, 'Логин') }, '📋')
                        )
                    ),
                    React.createElement('div', { className: 'card-field' },
                        React.createElement('label', null, 'Пароль'),
                        React.createElement('div', { className: 'card-field-value' },
                            React.createElement('span', null, '••••••••'),
                            React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => copyToClipboard(p.password, 'Пароль') }, '📋')
                        )
                    ),
                    p.url && React.createElement('div', { className: 'card-field' },
                        React.createElement('label', null, 'Сайт'),
                        React.createElement('div', { className: 'card-field-value' },
                            React.createElement('span', { className: 'card-link', onClick: () => window.open(p.url, '_blank') }, p.url)
                        )
                    ),
                    React.createElement('div', { className: 'card-actions' },
                        React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => toggleFavorite(p.id) }, p.favorite ? '⭐ В избранном' : '☆ В избранное'),
                        React.createElement('button', { className: 'btn btn-secondary btn-icon', onClick: () => { setEditingPassword(p); setShowModal(true); } }, '✏️ Изменить'),
                        React.createElement('button', { className: 'btn btn-danger btn-icon', onClick: () => handleDeletePassword(p.id) }, '️ Удалить')
                    )
                ))
            ),

        showModal && React.createElement(PasswordModal, { password: editingPassword, onSave: handleSavePassword, onClose: () => { setShowModal(false); setEditingPassword(null); }, darkMode })
    );
}

// ===== МОДАЛЬНОЕ ОКНО ПАРОЛЯ =====
function PasswordModal({ password, onSave, onClose, darkMode }) {
    const [formData, setFormData] = React.useState(password || { title: '', username: '', password: '', url: '', category: 'other', favorite: false });
    const [showGenerator, setShowGenerator] = React.useState(false);
    const [genLength, setGenLength] = React.useState(16);
    const [genOptions, setGenOptions] = React.useState({ uppercase: true, lowercase: true, numbers: true, symbols: true });
    const [generatedPassword, setGeneratedPassword] = React.useState('');
    const analysis = analyzePasswordStrength(formData.password);

    const generatePassword = () => {
        let chars = '';
        if (genOptions.uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (genOptions.lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
        if (genOptions.numbers) chars += '0123456789';
        if (genOptions.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const array = new Uint32Array(genLength);
        crypto.getRandomValues(array);
        setGeneratedPassword(Array.from(array).map(n => chars[n % chars.length]).join(''));
    };

    return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
        React.createElement('div', { className: 'modal', onClick: (e) => e.stopPropagation() },
            React.createElement('h2', null, password ? '✏️ Редактировать пароль' : '➕ Новый пароль'),
            React.createElement('form', { onSubmit: (e) => { e.preventDefault(); onSave(formData); } },
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', null, 'Название *'),
                    React.createElement('input', { type: 'text', value: formData.title, onChange: (e) => setFormData({ ...formData, title: e.target.value }), placeholder: 'Например: Gmail', required: true })
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', null, 'Логин / Email *'),
                    React.createElement('input', { type: 'text', value: formData.username, onChange: (e) => setFormData({ ...formData, username: e.target.value }), placeholder: 'user@example.com', required: true })
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', null, 'Пароль *'),
                    React.createElement('input', { type: 'text', value: formData.password, onChange: (e) => setFormData({ ...formData, password: e.target.value }), placeholder: 'Введите пароль', required: true }),
                    formData.password && React.createElement('div', { className: 'strength-indicator' },
                        React.createElement('div', { className: 'strength-header' },
                            React.createElement('span', { className: 'strength-label' }, 'Надёжность:'),
                            React.createElement('span', { className: 'strength-value', style: { color: analysis.color } }, analysis.strength)
                        ),
                        React.createElement('div', { className: 'strength-bar-bg' },
                            React.createElement('div', { className: 'strength-bar-fill', style: { width: `${(analysis.score / 6) * 100}%`, background: analysis.color } })
                        ),
                        analysis.feedback.length > 0 && React.createElement('div', { className: 'strength-feedback' }, '💡 ', analysis.feedback.join(', '))
                    ),
                    React.createElement('button', { type: 'button', className: 'btn btn-secondary', style: { marginTop: '10px', width: '100%' }, onClick: () => setShowGenerator(!showGenerator) }, showGenerator ? '🔼 Скрыть генератор' : '🎲 Сгенерировать пароль')
                ),
                showGenerator && React.createElement('div', { className: 'password-generator' },
                    React.createElement('div', { className: 'generated-password' },
                        React.createElement('input', { type: 'text', value: generatedPassword, readOnly: true, placeholder: 'Нажмите "Сгенерировать"' }),
                        React.createElement('button', { type: 'button', className: 'btn btn-success btn-icon', onClick: generatePassword }, '🎲')
                    ),
                    React.createElement('div', { className: 'generator-options' },
                        React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: genOptions.uppercase, onChange: (e) => setGenOptions({ ...genOptions, uppercase: e.target.checked }) }), 'A-Z'),
                        React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: genOptions.lowercase, onChange: (e) => setGenOptions({ ...genOptions, lowercase: e.target.checked }) }), 'a-z'),
                        React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: genOptions.numbers, onChange: (e) => setGenOptions({ ...genOptions, numbers: e.target.checked }) }), '0-9'),
                        React.createElement('label', null, React.createElement('input', { type: 'checkbox', checked: genOptions.symbols, onChange: (e) => setGenOptions({ ...genOptions, symbols: e.target.checked }) }), '!@#'),
                        React.createElement('label', null, 'Длина:', React.createElement('input', { type: 'number', min: '8', max: '64', value: genLength, onChange: (e) => setGenLength(parseInt(e.target.value)), className: 'gen-length-input' }))
                    ),
                    generatedPassword && React.createElement('button', { type: 'button', className: 'btn btn-success', style: { marginTop: '10px', width: '100%' }, onClick: () => { setFormData({ ...formData, password: generatedPassword }); setShowGenerator(false); } }, '✅ Использовать')
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', null, 'Сайт (необязательно)'),
                    React.createElement('input', { type: 'url', value: formData.url, onChange: (e) => setFormData({ ...formData, url: e.target.value }), placeholder: 'https://example.com' })
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', null, 'Категория'),
                    React.createElement('select', { value: formData.category, onChange: (e) => setFormData({ ...formData, category: e.target.value }), className: 'modal-select' },
                        React.createElement('option', { value: 'social' }, '💬 Соцсети'),
                        React.createElement('option', { value: 'email' }, '📧 Почта'),
                        React.createElement('option', { value: 'bank' }, '🏦 Банки'),
                        React.createElement('option', { value: 'work' }, '💼 Работа'),
                        React.createElement('option', { value: 'other' }, '📦 Другое')
                    )
                ),
                React.createElement('div', { className: 'modal-actions' },
                    React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onClose }, 'Отмена'),
                    React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, ' Сохранить')
                )
            )
        )
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));