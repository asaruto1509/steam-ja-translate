(function () {
  var KEY = 'ja_trans_gemini_key';
  var input = document.getElementById('apiKeyInput');
  var toggleBtn = document.getElementById('toggleBtn');
  var saveBtn = document.getElementById('saveBtn');
  var clearBtn = document.getElementById('clearBtn');
  var status = document.getElementById('status');
  var keyDisplay = document.getElementById('keyDisplay');

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className = 'status ' + type;
  }

  function updateDisplay(key) {
    if (key) {
      keyDisplay.textContent = '現在のキー: ' + key.slice(0, 8) + '••••••••' + key.slice(-4);
      showStatus('✓ APIキーが設定されています', 'ok');
    } else {
      keyDisplay.textContent = '';
      showStatus('APIキーが未設定です', 'none');
    }
  }

  // 起動時に現在のキーを読み込む
  chrome.storage.local.get([KEY], function (result) {
    var key = result[KEY];
    if (key) input.value = key;
    updateDisplay(key || null);
  });

  toggleBtn.addEventListener('click', function () {
    if (input.type === 'password') {
      input.type = 'text';
      toggleBtn.textContent = '隠す';
    } else {
      input.type = 'password';
      toggleBtn.textContent = '表示';
    }
  });

  saveBtn.addEventListener('click', function () {
    var key = input.value.trim();
    if (!key) {
      showStatus('キーを入力してください', 'err');
      return;
    }
    var obj = {};
    obj[KEY] = key;
    chrome.storage.local.set(obj, function () {
      updateDisplay(key);
    });
  });

  clearBtn.addEventListener('click', function () {
    chrome.storage.local.remove([KEY], function () {
      input.value = '';
      updateDisplay(null);
    });
  });
})();
