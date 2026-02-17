// Order Form – wa.me redirect only. No API, no fetch, no webhooks.
// Collects form data, formats message, redirects to https://wa.me/NUMBER?text=ENCODED_MESSAGE
(function () {
  var submitInProgress = false;

  function log() {
    if (typeof console !== 'undefined' && console.log) {
      console.log.apply(console, ['[order]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  window.proceedToCheckout = function () {
    var cartItems = window.getCartData && window.getCartData();
    if (!cartItems || cartItems.length === 0) {
      alert('Your cart is empty');
      return;
    }
    try {
      sessionStorage.setItem('checkoutCart', JSON.stringify(cartItems));
    } catch (e) {
      log('sessionStorage set failed', e);
    }
    window.location.href = './order.html';
  };

  function validateOrderForm() {
    var form = document.getElementById('order-form');
    if (!form) return false;

    var fullName = (form.querySelector('[name="fullName"]') || {}).value;
    var phone = (form.querySelector('[name="phone"]') || {}).value;
    var city = (form.querySelector('[name="city"]') || {}).value;

    fullName = fullName ? fullName.trim() : '';
    phone = phone ? phone.trim() : '';
    city = city ? city.trim() : '';

    if (!fullName) {
      alert('Please enter your full name');
      return false;
    }
    if (!phone) {
      alert('Please enter your phone number');
      return false;
    }
    if (!/^[0-9+\s-]+$/.test(phone)) {
      alert('Please enter a valid phone number');
      return false;
    }
    if (!city) {
      alert('Please enter your city');
      return false;
    }
    var cartRaw = '';
    try { cartRaw = sessionStorage.getItem('checkoutCart') || '[]'; } catch (e) {}
    var items = [];
    try { items = JSON.parse(cartRaw); } catch (e) {}
    if (!items || items.length === 0) {
      alert('Your cart is empty. Please add products before checkout.');
      return false;
    }
    return true;
  }

  function buildOrderPayload() {
    var form = document.getElementById('order-form');
    var formData = form ? new FormData(form) : null;
    var cartRaw = '';
    try {
      cartRaw = sessionStorage.getItem('checkoutCart') || '[]';
    } catch (e) {
      log('sessionStorage get failed', e);
    }
    var items = [];
    try {
      items = JSON.parse(cartRaw);
    } catch (e) {
      log('parse checkoutCart failed', e);
    }
    var total = (window.getCartTotal && window.getCartTotal()) || 0;

    return {
      fullName: formData ? formData.get('fullName') : '',
      phone: formData ? formData.get('phone') : '',
      city: formData ? formData.get('city') : '',
      notes: (formData && formData.get('notes')) || '',
      items: items,
      total: total,
      date: new Date().toISOString()
    };
  }

  function saveOrderToLocalStore(orderData) {
    if (typeof Store !== 'undefined' && Store.addOrder) {
      try {
        Store.addOrder(orderData);
        log('Order saved to localStorage');
        return true;
      } catch (e) {
        log('Store.addOrder failed', e);
      }
    }
    return false;
  }

  /** Build a plain-text order message for WhatsApp. */
  function formatOrderMessage(orderData) {
    var lines = [
      'New order',
      'Name: ' + (orderData.fullName || ''),
      'Phone: ' + (orderData.phone || ''),
      'City: ' + (orderData.city || '')
    ];
    if (orderData.notes && orderData.notes.trim()) {
      lines.push('Notes: ' + orderData.notes.trim());
    }
    lines.push('');
    lines.push('Items:');
    var items = orderData.items || [];
    items.forEach(function (item) {
      lines.push('- ' + (item.name || '') + ' · Size: ' + (item.size || '') + ' · Color: ' + (item.color || '') + ' · Qty: ' + (item.quantity || 0) + ' · ' + ((item.price || 0) * (item.quantity || 0)) + ' MAD');
    });
    lines.push('');
    lines.push('Total: ' + (orderData.total || 0) + ' MAD');
    return lines.join('\n');
  }

  function resetSubmitButton(submitBtn, originalText) {
    submitInProgress = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  function handleSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();

    if (submitInProgress) {
      log('Submit ignored (already in progress)');
      return;
    }
    if (!validateOrderForm()) return;

    var orderData;
    try {
      orderData = buildOrderPayload();
    } catch (e) {
      log('buildOrderPayload failed', e);
      alert('Unable to build order. Please try again.');
      return;
    }

    log('Send order via WhatsApp', orderData.fullName, orderData.total, 'MAD');

    var submitBtn = document.getElementById('submit-order-btn');
    var originalText = submitBtn ? submitBtn.textContent : 'Confirm Order';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = (typeof t !== 'undefined' && t('submitting')) ? t('submitting') : 'Submitting...';
    }
    submitInProgress = true;

    var waitStore = (typeof Store !== 'undefined' && Store.ready && typeof Store.ready.then === 'function') ? Store.ready : Promise.resolve();
    waitStore.then(function () {
      var number = (typeof Store !== 'undefined' && Store.getWhatsappNumber) ? Store.getWhatsappNumber() : null;
      if (!number) {
        resetSubmitButton(submitBtn, originalText);
        alert((typeof t !== 'undefined' && t('whatsappNumberNotSet')) ? t('whatsappNumberNotSet') : 'WhatsApp number is not set. Please ask the store owner to set it in the Admin Dashboard.');
        return;
      }
      var message = formatOrderMessage(orderData);
      var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
      saveOrderToLocalStore(orderData);
      if (window.clearCartAfterOrder) window.clearCartAfterOrder();
      try { sessionStorage.removeItem('checkoutCart'); } catch (e) {}
      window.location.href = url;
    }).catch(function (err) {
      log('Submit flow error', err);
      resetSubmitButton(submitBtn, originalText);
      alert((typeof t !== 'undefined' && t('orderSaveError')) ? t('orderSaveError') : 'Something went wrong. Please try again.');
    });
  }

  window.submitOrder = function () {
    handleSubmit({ preventDefault: function () {} });
  };

  function formatOrderItems(items) {
    return (items || []).map(function (item) {
      return item.name + ' - Size: ' + item.size + ', Color: ' + item.color + ', Quantity: ' + item.quantity + ', Price: ' + (item.price * item.quantity) + ' MAD';
    }).join('\n');
  }

  window.formatOrderItems = formatOrderItems;

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.location.pathname.includes('order.html') && !window.location.href.includes('order.html')) return;

    var form = document.getElementById('order-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        handleSubmit(e);
      }, false);
    }

    var cartRaw = '';
    try {
      cartRaw = sessionStorage.getItem('checkoutCart') || '[]';
    } catch (e) {}
    var cartItems = [];
    try {
      cartItems = JSON.parse(cartRaw);
    } catch (e) {}
    if (cartItems.length === 0) {
      alert('Your cart is empty. Redirecting to products...');
      window.location.href = './products.html';
      return;
    }
    renderOrderSummary(cartItems);
  });

  function renderOrderSummary(items) {
    var orderItemsEl = document.getElementById('order-items');
    var orderTotalEl = document.getElementById('order-total');
    if (!orderItemsEl) return;

    orderItemsEl.innerHTML = (items || []).map(function (item, index) {
      return (
        '<div class="order-item">' +
          '<div class="order-item-number">' + (index + 1) + '</div>' +
          '<div class="order-item-details">' +
            '<h4>' + (item.name || '') + '</h4>' +
            '<p>Size: ' + (item.size || '') + ' · Color: ' + (item.color || '') + ' · Quantity: ' + (item.quantity || 0) + '</p>' +
          '</div>' +
          '<div class="order-item-price">' + ((item.price || 0) * (item.quantity || 0)) + ' MAD</div>' +
        '</div>'
      );
    }).join('');

    if (orderTotalEl && window.getCartTotal) {
      orderTotalEl.textContent = window.getCartTotal() + ' MAD';
    }
  }

  window.renderOrderSummary = renderOrderSummary;
})();
