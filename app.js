/**
 * ระบบบริหารจัดการยานพาหนะและรถพยาบาล - โรงพยาบาลไทรโยค (Car 2)
 * Main Application Logic & Controller
 */

// Global State
let globalData = [];
let carList = [];
let userList = [];
let driverList = [];

let unlockedAssign = false;
let unlockedDriver = false;
let unlockedOil = false;

let isFetchingData = false;
let isFetchingOil = false;

let oilPendingList = [];
let oilHistoryList = [];

// Modules Instances
let carCalendar = null;
let carDashboard = null;
let sigPad1 = null;
let sigPad2 = null;

// Modals Instances
let modalAssign = null;
let modalDriver = null;
let modalView = null;
let modalOilReq = null;
let modalOilPen = null;
let modalOilApp = null;
let modalOilRep = null;

/* ==========================================================================
   1. API Communication
   ========================================================================== */

async function fetchAPI(action, payload = null) {
  const url = window.CONFIG?.WEB_APP_URL || '';
  const bodyObj = payload !== null ? { action, payload } : { action };

  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(bodyObj)
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('ไม่พบเพจ') || text.includes('ขออภัย')) {
        throw new Error('Google Apps Script ตอบกลับเป็นหน้าเว็บข้อผิดพลาด (HTML)\nสาเหตุ: ยังไม่ได้ตั้งค่าสิทธิ์การเข้าถึงเป็น "ทุกคน (Anyone)" หรือยังไม่ได้ตั้ง "ดำเนินการในฐานะ (Execute as)" เป็น "ฉัน (Me)"');
      }
      throw new Error('ข้อมูลจากเซิร์ฟเวอร์ไม่ถูกต้อง: ' + parseErr.message);
    }

    return data;
  } catch (err) {
    console.warn(`API call [${action}] failed:`, err);
    throw err;
  }
}

async function callAPI(action, payload) {
  Swal.fire({
    title: 'กำลังประมวลผล...',
    html: '<div class="text-muted small">โปรดรอสักครู่ ระบบกำลังเชื่อมต่อฐานข้อมูล</div>',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const data = await fetchAPI(action, payload);
    if (data.status !== 'success') {
      throw new Error(data.message || 'การทำงานไม่สำเร็จ');
    }
    return data;
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'ข้อผิดพลาดระบบ',
      text: err.message,
      confirmButtonText: 'ตกลง'
    });
    throw err;
  }
}

/* ==========================================================================
   2. Options & Master Data
   ========================================================================== */

async function loadOptions() {
  try {
    const json = await fetchAPI('getOptions');
    if (json.status === 'success') {
      const d = json.data;
      userList = d.users || [];
      driverList = d.drivers || [];
      carList = d.cars || [];

      populateUserSelect();
      populateDriverSelects();
      populateCarSelects();
    }
  } catch (err) {
    console.warn('Could not load options from remote, using initial defaults:', err);
    // กรณีที่ดึงไม่ได้ ให้เตรียมโครงสร้างไว้
    populateUserSelect();
    populateDriverSelects();
    populateCarSelects();
  }
}

function populateUserSelect() {
  const el = document.getElementById('req_c');
  if (!el) return;

  el.innerHTML = '<option value="" disabled selected>เลือกหรือค้นหาชื่อผู้ขอ...</option>';
  userList.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.name;
    opt.textContent = `${u.name} (${u.group || 'ไม่ระบุกลุ่มงาน'})`;
    el.appendChild(opt);
  });

  if (window.jQuery && $.fn.select2) {
    $('#req_c').select2({
      theme: 'bootstrap-5',
      placeholder: 'พิมพ์ค้นหาชื่อผู้ขอ...',
      width: '100%'
    });
  }
}

function populateDriverSelects() {
  const driverSel = document.getElementById('assign_m');
  const filterSel = document.getElementById('filterDriver');

  if (driverSel) {
    driverSel.innerHTML = '<option value="" disabled selected>เลือกพนักงานขับรถ...</option>';
    driverList.forEach(d => {
      driverSel.innerHTML += `<option value="${d}">${d}</option>`;
    });
  }

  if (filterSel) {
    filterSel.innerHTML = '<option value="">-- กรองผู้ขับรถทั้งหมด --</option>';
    driverList.forEach(d => {
      filterSel.innerHTML += `<option value="${d}">${d}</option>`;
    });
  }
}

function populateCarSelects() {
  const plateSelect = document.getElementById('assign_n');
  const oilCarSelect = document.getElementById('oilCar');

  if (plateSelect) {
    plateSelect.innerHTML = '<option value="" disabled selected>เลือกทะเบียนรถ</option>';
    carList.forEach(c => {
      plateSelect.innerHTML += `<option value="${c.plate}">${c.plate} - ${c.model || ''}</option>`;
    });

    if (window.jQuery && $.fn.select2) {
      $('#assign_n').select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#modalAssign'),
        placeholder: 'เลือกทะเบียนรถ...',
        width: '100%'
      });
    }
  }

  if (oilCarSelect) {
    oilCarSelect.innerHTML = '<option value="">-- เลือกทะเบียนรถ (ถ้ามี) --</option>';
    carList.forEach(c => {
      oilCarSelect.innerHTML += `<option value="${c.plate}">${c.plate} - ${c.model || ''}</option>`;
    });
  }
}

/* ==========================================================================
   3. Main Data Loading & Syncing
   ========================================================================== */

async function loadData(silent = true) {
  if (isFetchingData) return;
  isFetchingData = true;

  updateSyncBadge('syncing', 'กำลังอัปเดตข้อมูล...');
  if (!silent) {
    Swal.fire({
      title: 'กำลังดึงข้อมูลล่าสุด...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    const json = await fetchAPI('getData');
    if (json.status !== 'success') throw new Error(json.message);

    globalData = json.data || [];
    renderTables();

    // อัปเดตปฏิทิน
    if (carCalendar) {
      carCalendar.updateEvents(globalData);
    }

    // อัปเดตแดชบอร์ด
    if (carDashboard) {
      carDashboard.setData(globalData);
    }

    updateBadgeCounters();
    updateSyncBadge('online', 'ออนไลน์ (ซิงค์แล้ว)');
  } catch (err) {
    console.error('Load Data Error:', err);
    updateSyncBadge('offline', 'ออฟไลน์ / มีข้อผิดพลาด');
    if (!silent) {
      Swal.fire('ข้อผิดพลาด', 'โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }
  } finally {
    isFetchingData = false;
    if (!silent) Swal.close();
  }
}

function updateSyncBadge(status, text) {
  const badge = document.getElementById('syncStatusBadge');
  if (!badge) return;

  if (status === 'online') {
    badge.className = 'sync-status-badge';
    badge.innerHTML = '<span class="dot" style="background-color:#10b981;"></span> ' + text;
  } else if (status === 'syncing') {
    badge.className = 'sync-status-badge';
    badge.style.borderColor = '#93c5fd';
    badge.style.background = '#eff6ff';
    badge.style.color = '#1e40af';
    badge.innerHTML = '<span class="dot" style="background-color:#3b82f6;"></span> ' + text;
  } else {
    badge.className = 'sync-status-badge';
    badge.style.borderColor = '#fca5a5';
    badge.style.background = '#fef2f2';
    badge.style.color = '#991b1b';
    badge.innerHTML = '<span class="dot" style="background-color:#ef4444;"></span> ' + text;
  }
}

function updateBadgeCounters() {
  let pendingAssign = 0;
  let pendingDriver = 0;

  globalData.forEach(row => {
    if (!row || !row[0]) return;
    const driver = row[12];
    const diffKm = row[19];

    if (driver && String(driver).includes('ยกเลิก')) return;

    if (!driver || String(driver).trim() === '') {
      pendingAssign++;
    } else if (diffKm === '' || diffKm === null || diffKm === undefined) {
      pendingDriver++;
    }
  });

  const bAssign = document.getElementById('badgeCountAssign');
  const bDriver = document.getElementById('badgeCountDriver');

  if (bAssign) {
    bAssign.textContent = pendingAssign;
    bAssign.style.display = pendingAssign > 0 ? 'inline-block' : 'none';
  }

  if (bDriver) {
    bDriver.textContent = pendingDriver;
    bDriver.style.display = pendingDriver > 0 ? 'inline-block' : 'none';
  }
}

/* ==========================================================================
   4. Table Rendering & DataTables
   ========================================================================== */

function formatDateUI(dStr) {
  if (!dStr) return '-';
  const d = new Date(dStr);
  if (isNaN(d)) return dStr;
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderTables() {
  let assignData = [];
  let driverData = [];
  let reportData = [];

  globalData.forEach(row => {
    if (!row || !row[0]) return;
    const id = row[0];
    const start = formatDateUI(row[4]);
    const end = formatDateUI(row[5]);
    const req = row[2] || '-';
    const subj = row[6] || '-';
    const place = row[7] || '-';
    const cType = row[11] || '-';
    const driver = row[12];
    const plate = row[13];
    const diffKm = row[19];
    const printCount = parseInt(row[23], 10) || 0;

    let status = 'รอจัดรถ';
    let badgeClass = 'badge-status-pending';

    if (driver) {
      if (String(driver).includes('ยกเลิก')) {
        status = 'ยกเลิก';
        badgeClass = 'badge-status-cancelled';
      } else if (diffKm !== '' && diffKm !== null && diffKm !== undefined) {
        status = 'เสร็จสิ้น';
        badgeClass = 'badge-status-completed';
      } else {
        status = 'รอขับรถ';
        badgeClass = 'badge-status-assigned';
      }
    }

    // 1. ตารางจัดรถ (Assign Table)
    if (id && (!driver || !String(driver).includes('ยกเลิก'))) {
      const isAssigned = driver && driver.trim() !== '';
      const assignBtn = !isAssigned
        ? `<button class="btn btn-sm btn-primary rounded-pill px-3" onclick="openAssign('${id}')"><i class="bi bi-key me-1"></i>จัดรถ</button>`
        : `<button class="btn btn-sm btn-outline-success rounded-pill px-3" onclick="openAssign('${id}')"><i class="bi bi-pencil me-1"></i>แก้ไข (${plate || driver})</button>`;

      assignData.push([
        assignBtn,
        `<span class="fw-bold font-heading text-primary">${id}</span>`,
        start,
        `<span class="text-danger">${end}</span>`,
        req,
        subj,
        place,
        `<span class="badge bg-light text-dark border">${cType}</span>`
      ]);
    }

    // 2. ตารางรายงาน พขร. (Driver Table)
    if (driver && id && !String(driver).includes('ยกเลิก')) {
      const hasReported = diffKm !== '' && diffKm !== null && diffKm !== undefined;
      const driverBtn = !hasReported
        ? `<button class="btn btn-sm btn-warning rounded-pill px-3 text-dark fw-bold" onclick="openDriver('${id}')"><i class="bi bi-speedometer2 me-1"></i>ลงไมล์</button>`
        : `<button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="openDriver('${id}')"><i class="bi bi-pencil me-1"></i>แก้ไข (${diffKm} กม.)</button>`;

      driverData.push([
        driverBtn,
        `<span class="fw-bold font-heading text-primary">${id}</span>`,
        start,
        `<span class="text-danger">${end}</span>`,
        req,
        place,
        `<span class="fw-medium">${driver}</span>`,
        `<span class="badge bg-light text-dark border">${plate || '-'}</span>`
      ]);
    }

    // 3. ตารางประวัติและพิมพ์ (Report Table)
    if (id) {
      const printBadge = printCount > 0
        ? ` <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">พิมพ์ ${printCount}</span>`
        : '';

      reportData.push([
        `<button class="btn btn-sm btn-outline-secondary rounded-pill px-2" onclick="openView('${id}', false)"><i class="bi bi-search me-1"></i>ดู</button>`,
        `<span class="fw-bold font-heading text-primary">${id}</span>`,
        `<span class="badge-status ${badgeClass}">${status}</span>${printBadge}`,
        start,
        `<span class="text-danger">${end}</span>`,
        req,
        place,
        driver || '-',
        plate || '-',
        diffKm !== '' && diffKm !== null && diffKm !== undefined ? `${diffKm} กม.` : '-'
      ]);
    }
  });

  updateDataTable('#tableAssign', assignData, [[1, 'desc']]);

  if (!$.fn.DataTable.isDataTable('#tableDriver')) {
    const tableDr = $('#tableDriver').DataTable({
      data: driverData,
      responsive: true,
      language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
      order: [[1, 'desc']],
      stateSave: true
    });
    $('#filterDriver').off('change').on('change', function () {
      tableDr.column(6).search(this.value).draw();
    });
  } else {
    $('#tableDriver').DataTable().clear().rows.add(driverData).draw(false);
  }

  updateDataTable('#tableReport', reportData, [[1, 'desc']]);
}

function updateDataTable(selector, dataset, order) {
  if ($.fn.DataTable.isDataTable(selector)) {
    $(selector).DataTable().clear().rows.add(dataset).draw(false);
  } else {
    $(selector).DataTable({
      data: dataset,
      responsive: true,
      language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
      order: order,
      stateSave: true
    });
  }
}

/* ==========================================================================
   5. Form Request (เขียนขอใช้รถ)
   ========================================================================== */

function setupRequestForm() {
  const form = document.getElementById('formRequest');
  if (!form) return;

  // เมื่อเลือกผู้ขอ ให้ใส่กลุ่มงานอัตโนมัติ
  $('#req_c').on('change', function () {
    const val = $(this).val();
    const selectedUser = userList.find(u => u.name === val);
    $('#req_d').val(selectedUser ? selectedUser.group : '');
  });

  // คำนวณระยะเวลาเดินทางแบบเรียลไทม์
  $('#req_e, #req_f').on('change input', updateTripDurationPreview);

  // ปุ่มเลือกประเภทรถแบบการ์ด/ชิป
  document.querySelectorAll('.usage-chip-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.usage-chip-btn').forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      const val = this.getAttribute('data-value');
      $('#req_l').val(val);
    });
  });

  $('#req_l').on('change', function () {
    const val = $(this).val();
    document.querySelectorAll('.usage-chip-btn').forEach(b => {
      b.classList.toggle('selected', b.getAttribute('data-value') === val);
    });
  });

  // ส่งข้อมูลขอใช้รถ
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const stVal = document.getElementById('req_e').value;
    const enVal = document.getElementById('req_f').value;
    if (!stVal || !enVal) {
      return Swal.fire('คำเตือน', 'กรุณาระบุวันและเวลาเดินทางให้ครบถ้วน', 'warning');
    }

    const st = new Date(stVal);
    const en = new Date(enVal);
    if (en - st < 1800000) {
      return Swal.fire({
        icon: 'error',
        title: 'เวลาไม่ถูกต้อง',
        text: 'วันเวลาสิ้นสุด ต้องมากกว่า วันเวลาเริ่มต้น อย่างน้อย 30 นาที'
      });
    }

    const parseThaiDate = (val) => {
      if (!val) return val;
      let [d, t] = val.split('T');
      let [y, m, day] = d.split('-');
      let yInt = parseInt(y, 10);
      if (yInt > 2500) yInt -= 543;
      return `${yInt}-${m}-${day}T${t}`;
    };

    const payload = {
      requester: $('#req_c').val(),
      group: $('#req_d').val(),
      start: parseThaiDate(stVal),
      end: parseThaiDate(enVal),
      subject: $('#req_g').val(),
      place: $('#req_h').val(),
      qty: $('#req_i').val(),
      include: $('#req_j').val(),
      detail: $('#req_k').val(),
      carType: $('#req_l').val()
    };

    try {
      const res = await callAPI('requestCar', payload);
      Swal.fire({
        icon: 'success',
        title: 'บันทึกคำขอใช้รถเรียบร้อย',
        html: `<div class="py-2">เลขที่คำขอของคุณคือ: <h3 class="text-primary font-heading my-2">${res.data?.id || '-'}</h3><p class="text-muted small">ระบบได้บันทึกลงปฏิทินและแจ้งเตือนเข้ากลุ่มงานเรียบร้อยแล้ว</p></div>`,
        confirmButtonText: 'ดูในปฏิทิน'
      }).then(() => {
        form.reset();
        $('#req_c').val('').trigger('change');
        document.querySelectorAll('.usage-chip-btn').forEach(b => b.classList.remove('selected'));
        updateTripDurationPreview();
        loadData(true);
        switchPage('page-calendar');
      });
    } catch (err) {
      // callAPI handles alert
    }
  });
}

function updateTripDurationPreview() {
  const stVal = document.getElementById('req_e').value;
  const enVal = document.getElementById('req_f').value;
  const badge = document.getElementById('tripDurationBadge');
  if (!badge) return;

  if (!stVal || !enVal) {
    badge.style.display = 'none';
    return;
  }

  const st = new Date(stVal);
  const en = new Date(enVal);
  const diffMs = en - st;

  if (isNaN(diffMs) || diffMs <= 0) {
    badge.className = 'trip-duration-badge bg-danger-subtle text-danger border-danger-subtle';
    badge.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i> เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น';
    badge.style.display = 'inline-flex';
    return;
  }

  const totalMin = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  let durationText = '';
  if (days > 0) {
    durationText = `${days} วัน ${remHours} ชั่วโมง ${mins > 0 ? mins + ' นาที' : ''}`;
  } else if (hours > 0) {
    durationText = `${hours} ชั่วโมง ${mins > 0 ? mins + ' นาที' : ''}`;
  } else {
    durationText = `${mins} นาที`;
  }

  badge.className = 'trip-duration-badge';
  badge.innerHTML = `<i class="bi bi-clock me-1"></i> ระยะเวลาการใช้รถ: <b>${durationText}</b>`;
  badge.style.display = 'inline-flex';
}

/* ==========================================================================
   6. Dispatching Modal (จัดรถ)
   ========================================================================== */

function openAssign(id) {
  $('#assign_id').val(id);
  $('#assign_id_lbl').text(id);
  $('#formAssign')[0].reset();
  $('#assign_n').val('').trigger('change');

  const row = globalData.find(r => r[0] == id);
  if (row) {
    $('#assign_summary_req').text(row[2] || '-');
    $('#assign_summary_group').text(row[3] || '-');
    $('#assign_summary_subj').text(row[6] || '-');
    $('#assign_summary_place').text(row[7] || '-');
    $('#assign_summary_time').text(`${formatDateUI(row[4])} ถึง ${formatDateUI(row[5])}`);
    $('#assign_summary_passengers').text(`${row[8] || '0'} คน (${row[9] || '-'})`);

    if (row[12]) $('#assign_m').val(row[12]);
    if (row[13]) {
      $('#assign_n').val(row[13]).trigger('change');
      $('#assign_o').val(row[14] || '');
    }
  }

  modalAssign.show();
}

function setupAssignForm() {
  $('#assign_n').on('change', function () {
    const val = $(this).val();
    const selectedCar = carList.find(c => String(c.plate).trim() === String(val).trim());
    $('#assign_o').val(selectedCar ? selectedCar.model : '');
  });

  const form = document.getElementById('formAssign');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#assign_id').val();
    const driver = $('#assign_m').val();
    const plate = $('#assign_n').val();
    const model = $('#assign_o').val();

    await callAPI('assignCar', { id, driver, plate, model });
    Swal.fire('สำเร็จ', 'บันทึกการจัดรถเรียบร้อย', 'success');
    modalAssign.hide();
    loadData(true);
  });
}

/* ==========================================================================
   7. Driver Mileage Report (รายงาน พขร.)
   ========================================================================== */

function toDateTimeLocal(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(d - tzoffset)).toISOString().slice(0, 16);
}

function openDriver(id) {
  $('#driver_id').val(id);
  $('#driver_id_lbl').text(id);
  $('#formDriver')[0].reset();

  const row = globalData.find(r => r[0] == id);
  if (row) {
    $('#driver_summary_place').text(row[7] || '-');
    $('#driver_summary_plate').text(`${row[13] || '-'} (${row[14] || '-'})`);
    $('#driver_summary_reqtime').text(`${formatDateUI(row[4])} ถึง ${formatDateUI(row[5])}`);

    // กำหนดเวลาจริง เริ่มต้นใช้วันที่ขอ
    const pVal = row[15] ? toDateTimeLocal(row[15]) : toDateTimeLocal(row[4]);
    const qVal = row[16] ? toDateTimeLocal(row[16]) : toDateTimeLocal(row[5]);
    $('#driver_p').val(pVal);
    $('#driver_q').val(qVal);

    if (row[17] !== '') $('#driver_r').val(row[17]);
    if (row[18] !== '') $('#driver_s').val(row[18]);
    if (row[19] !== '') $('#driver_t').val(row[19]);
    if (row[20] !== '') $('#driver_u').val(row[20]);
    if (row[21] !== '') $('#driver_v').val(row[21]);

    calcKM();
  }

  modalDriver.show();
}

function calcKM() {
  const start = parseFloat($('#driver_r').val()) || 0;
  const end = parseFloat($('#driver_s').val()) || 0;
  const diff = end - start;

  $('#driver_t').val(diff > 0 ? diff : 0);
  $('#odometerDiffDisplay').text(diff > 0 ? diff.toLocaleString('th-TH') + ' กม.' : '0 กม.');

  if (diff <= 0 && $('#driver_s').val() !== '') {
    $('#driver_t').addClass('is-invalid');
    $('#odometerDiffDisplay').addClass('text-danger').removeClass('text-info');
  } else {
    $('#driver_t').removeClass('is-invalid');
    $('#odometerDiffDisplay').removeClass('text-danger').addClass('text-info');
  }

  // คำนวณความประหยัดน้ำมันถ้ามีการกรอก
  const fuel = parseFloat($('#driver_u').val()) || 0;
  const cost = parseFloat($('#driver_v').val()) || 0;
  if (diff > 0 && fuel > 0) {
    const kmPerL = (diff / fuel).toFixed(2);
    $('#fuelEfficiencyText').text(`อัตราสิ้นเปลือง: ${kmPerL} กม./ลิตร`);
  } else {
    $('#fuelEfficiencyText').text('');
  }
}

function setupDriverForm() {
  $('#driver_r, #driver_s, #driver_u, #driver_v').on('input', calcKM);

  // ปุ่มลัดใช้วันเวลาตามใบขอ
  $('#btnUseReqTime').on('click', () => {
    const id = $('#driver_id').val();
    const row = globalData.find(r => r[0] == id);
    if (row) {
      if (row[4]) $('#driver_p').val(toDateTimeLocal(row[4]));
      if (row[5]) $('#driver_q').val(toDateTimeLocal(row[5]));
    }
  });

  const form = document.getElementById('formDriver');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const actSt = new Date($('#driver_p').val());
    const actEn = new Date($('#driver_q').val());
    const diffKm = parseFloat($('#driver_t').val());

    if (actEn - actSt < 1800000) {
      return Swal.fire('ข้อผิดพลาด', 'เวลา "ขับถึงจริง" ต้องมากกว่า "ขับจริง" อย่างน้อย 30 นาที', 'error');
    }

    if (diffKm <= 0) {
      return Swal.fire('ข้อผิดพลาด', 'เลขกิโลเมตรถึง ต้องมากกว่า กิโลเมตรเริ่มต้น', 'error');
    }

    const payload = {
      id: $('#driver_id').val(),
      actStart: $('#driver_p').val(),
      actEnd: $('#driver_q').val(),
      startKm: $('#driver_r').val(),
      endKm: $('#driver_s').val(),
      diffKm: diffKm,
      fuel: $('#driver_u').val(),
      cost: $('#driver_v').val()
    };

    await callAPI('driverReport', payload);
    Swal.fire('สำเร็จ', 'บันทึกรายงานการขับรถเรียบร้อย', 'success');
    modalDriver.hide();
    loadData(true);
  });
}

/* ==========================================================================
   8. Detail View & Printing (ประวัติและพิมพ์เอกสาร)
   ========================================================================== */

function openView(id, fromCalendar = false) {
  $('#view_id_lbl').text(id);
  const row = globalData.find(r => r[0] == id);
  if (!row) return;

  const diffKm = row[19];
  const driver = row[12];
  let statusBadge = '<span class="badge-status badge-status-pending">รอจัดรถ</span>';
  if (driver) {
    if (String(driver).includes('ยกเลิก')) {
      statusBadge = '<span class="badge-status badge-status-cancelled">ยกเลิก</span>';
    } else if (diffKm !== '' && diffKm !== null && diffKm !== undefined) {
      statusBadge = '<span class="badge-status badge-status-completed">เดินทางเสร็จสิ้น</span>';
    } else {
      statusBadge = '<span class="badge-status badge-status-assigned">รอขับรถ</span>';
    }
  }

  $('#viewBody').html(`
    <div class="col-12 mb-3">
      <div class="p-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
        <div>
          <span class="text-muted small">รหัสคำขอ:</span>
          <h4 class="m-0 font-heading text-primary">${row[0]}</h4>
        </div>
        <div>${statusBadge}</div>
      </div>
    </div>
    <div class="col-md-6 mb-2"><b>ผู้ขอ:</b> ${row[2] || '-'}</div>
    <div class="col-md-6 mb-2"><b>กลุ่มงาน:</b> ${row[3] || '-'}</div>
    <div class="col-md-6 mb-2"><b>ขอวันที่:</b> ${formatDateUI(row[4])}</div>
    <div class="col-md-6 mb-2"><b>ถึงวันที่:</b> <span class="text-danger">${formatDateUI(row[5])}</span></div>
    <div class="col-12 mb-2"><b>เรื่อง:</b> ${row[6] || '-'}</div>
    <div class="col-12 mb-2"><b>สถานที่:</b> ${row[7] || '-'}</div>
    <div class="col-12 mb-2"><b>จำนวนผู้เดินทาง:</b> ${row[8] || '0'} คน (${row[9] || '-'})</div>
    <div class="col-12 mb-3"><b>ประเภทการใช้รถ:</b> <span class="badge bg-secondary">${row[11] || '-'}</span></div>
    
    <div class="col-12"><hr class="my-2"></div>

    <div class="col-md-6 mb-2"><b>พนักงานขับรถ:</b> ${row[12] || '-'}</div>
    <div class="col-md-6 mb-2"><b>รถยนต์:</b> ${row[13] || '-'} (${row[14] || '-'})</div>
    <div class="col-md-6 mb-2"><b>ออกเดินทางจริง:</b> ${formatDateUI(row[15])}</div>
    <div class="col-md-6 mb-2"><b>กลับถึงจริง:</b> ${formatDateUI(row[16])}</div>
    <div class="col-md-6 mb-2"><b>เลขไมล์:</b> ${row[17] || '-'} ถึง ${row[18] || '-'}</div>
    <div class="col-md-6 mb-2"><b>ระยะทางรวม:</b> <span class="text-success fw-bold">${row[19] !== '' ? row[19] + ' กม.' : '-'}</span></div>
    <div class="col-md-6 mb-2"><b>เติมน้ำมัน:</b> ${row[20] || '-'} ลิตร</div>
    <div class="col-md-6 mb-2"><b>เป็นเงิน:</b> ${row[21] || '-'} บาท</div>
  `);

  modalView.show();
}

function pDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  if (isNaN(d)) return '';
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function pTime(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  if (isNaN(d)) return '';
  return `${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)} น.`;
}

async function printDoc() {
  const id = $('#view_id_lbl').text();
  const row = globalData.find(r => r[0] == id);
  if (!row) return;

  // กรอกข้อมูลลงแบบฟอร์มมาตรฐาน
  $('#prt_id').text(row[0] || '');
  $('#prt_date').text(pDate(row[1]));
  $('#prt_req').text(row[2] || '');
  $('#prt_req_name').text(row[2] || '');
  $('#prt_req_sign').text(row[2] || '');
  $('#prt_group').text(row[3] || '');
  $('#prt_subj').text(row[6] || '');
  $('#prt_place').text(row[7] || '');
  $('#prt_aplace').text(row[7] || '');
  $('#prt_qty').text(row[8] || '');
  $('#prt_include').text(row[9] || '');

  $('#prt_sd').text(pDate(row[4]));
  $('#prt_st').text(pTime(row[4]));
  $('#prt_ed').text(pDate(row[5]));
  $('#prt_et').text(pTime(row[5]));

  $('#prt_model').text(row[14] || '');
  $('#prt_amodel').text(row[14] || '');
  $('#prt_plate').text(row[13] || '');
  $('#prt_aplate').text(row[13] || '');
  $('#prt_driver').text(row[12] || '');
  $('#prt_d_name').text(row[12] || '');
  $('#prt_d_sign').text(row[12] || '');
  $('#prt_fuel').text(row[20] || '');
  $('#prt_cost').text(row[21] || '');

  $('#prt_asd').text(pDate(row[15]));
  $('#prt_ast').text(pTime(row[15]));
  $('#prt_aed').text(pDate(row[16]));
  $('#prt_aet').text(pTime(row[16]));
  $('#prt_skm').text(row[17] || '');
  $('#prt_ekm').text(row[18] || '');
  $('#prt_dkm').text(row[19] || '');

  modalView.hide();

  setTimeout(() => {
    window.print();
    // บันทึกสถิติการพิมพ์ไปยังเซิร์ฟเวอร์
    fetchAPI('printDoc', { id })
      .then(() => loadData(true))
      .catch(e => console.warn(e));
  }, 400);
}

/* ==========================================================================
   9. Fuel Inventory System (ระบบน้ำมันคลัง พขร.)
   ========================================================================== */

async function loadOilData(silent = true) {
  if (isFetchingOil) return;
  isFetchingOil = true;

  if (!silent) {
    Swal.fire({
      title: 'โหลดข้อมูลน้ำมัน...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    const json = await fetchAPI('getOilData');
    if (json.status !== 'success') throw new Error(json.message);

    const d = json.data;
    const bal = parseFloat(d.balance || 0);
    $('#oilBalanceDisplay').text(bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    oilPendingList = d.pending || [];
    oilHistoryList = d.history || [];

    $('#oilPendingBadge').text(oilPendingList.length);
    $('#oilPendingBadge').toggle(oilPendingList.length > 0);
  } catch (err) {
    console.error('Load Oil Data Error:', err);
    if (!silent) Swal.fire('ผิดพลาดระบบน้ำมัน', err.message, 'error');
  } finally {
    isFetchingOil = false;
    if (!silent) Swal.close();
  }
}

function toggleOilType() {
  const type = $('#oilType').val();
  if (type === 'out') {
    $('#oilCarDiv').show();
    $('#oilCar').prop('required', true);
  } else {
    $('#oilCarDiv').hide();
    $('#oilCar').prop('required', false).val('');
  }
}

function openOilRequest() {
  $('#formOilRequest')[0].reset();
  toggleOilType();
  if (sigPad1) sigPad1.clear();
  modalOilReq.show();
}

function setupOilModule() {
  // ฟอร์มส่งคำขอน้ำมัน
  const formOil = document.getElementById('formOilRequest');
  if (formOil) {
    formOil.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!sigPad1 || sigPad1.isEmpty()) {
        return Swal.fire('คำเตือน', 'กรุณาเซ็นชื่อก่อนบันทึกรายการ', 'warning');
      }

      const type = $('#oilType').val();
      const qty = parseFloat($('#oilQty').val());
      const payload = {
        inQty: type === 'in' ? qty : '',
        outQty: type === 'out' ? qty : '',
        car: $('#oilCar').val() || '',
        detail: $('#oilDetail').val(),
        sig1: sigPad1.toDataURL()
      };

      await callAPI('requestOil', payload);
      Swal.fire('สำเร็จ', 'ส่งรายการรอนุมัติเรียบร้อย', 'success');
      modalOilReq.hide();
      loadOilData(true);
    });
  }

  // ฟอร์มอนุมัติน้ำมัน
  const formApp = document.getElementById('formOilApprove');
  if (formApp) {
    formApp.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!sigPad2 || sigPad2.isEmpty()) {
        return Swal.fire('คำเตือน', 'กรุณาเซ็นชื่อผู้อนุมัติ', 'warning');
      }

      const payload = {
        row: $('#oilApproveRow').val(),
        note: $('#oilNote').val(),
        sig2: sigPad2.toDataURL()
      };

      await callAPI('approveOil', payload);
      Swal.fire('สำเร็จ', 'อนุมัติเรียบร้อย ยอดคงเหลือถูกอัปเดตแล้ว', 'success');
      modalOilApp.hide();
      loadOilData(true);
    });
  }
}

async function checkLoginOilApprove() {
  if (!unlockedOil) {
    const { value: pass } = await Swal.fire({
      title: '🔐 รหัสผ่านผู้อนุมัติน้ำมัน',
      input: 'password',
      inputPlaceholder: 'กรอกรหัสผ่าน (11278)',
      showCancelButton: true,
      confirmButtonText: 'เข้าสู่ระบบ'
    });

    if (!pass) return;

    try {
      const res = await callAPI('checkAuth', { type: 'oil', pass: pass });
      if (res.data === true) {
        unlockedOil = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    } catch (e) {
      if (pass === window.CONFIG?.DEFAULT_PASSWORDS?.oil) {
        unlockedOil = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    }
  }
  openOilPending();
}

function openOilPending() {
  let pendingData = [];
  oilPendingList.forEach(item => {
    const r = item.data;
    const typeStr = r[1]
      ? '<span class="badge bg-success-subtle text-success border border-success-subtle">นำเข้า</span>'
      : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">เบิกออก</span>';
    const qty = r[1] ? r[1] : r[2];
    const img = r[6] ? `<img src="${r[6]}" style="height:32px; border:1px solid #e2e8f0; border-radius:4px;">` : '';

    pendingData.push([
      `<button class="btn btn-sm btn-primary rounded-pill px-3" onclick="openOilApprove(${item.row})"><i class="bi bi-pen me-1"></i>พิจารณา</button>`,
      formatDateUI(r[0]),
      typeStr,
      `<span class="fw-bold font-heading text-primary">${qty} ลิตร</span>`,
      r[4] || '-',
      r[5] || '-',
      img
    ]);
  });

  updateDataTable('#tableOilPending', pendingData, []);
  modalOilPen.show();
}

function openOilApprove(rowNum) {
  const item = oilPendingList.find(x => x.row === rowNum);
  if (!item) return;
  const r = item.data;
  const typeTxt = r[1] ? `นำเข้า ${r[1]} ลิตร` : `เบิกออก ${r[2]} ลิตร`;

  $('#oilApproveSummary').html(`
    กำลังอนุมัติรายการ: <b>${typeTxt}</b><br>
    วัตถุประสงค์/รายละเอียด: ${r[5] || '-'}<br>
    ใช้ที่รถ: ${r[4] || '-'}
  `);

  $('#oilApproveRow').val(rowNum);
  $('#oilNote').val('');
  if (sigPad2) sigPad2.clear();

  modalOilPen.hide();
  modalOilApp.show();
}

function openOilReport() {
  let repData = [];
  oilHistoryList.forEach(item => {
    const r = item.data;
    const status = item.approved
      ? '<span class="badge bg-success-subtle text-success border border-success-subtle">อนุมัติแล้ว</span>'
      : '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">รออนุมัติ</span>';
    const sig1 = r[6] ? `<img src="${r[6]}" height="26">` : '';
    const sig2 = r[7] ? `<img src="${r[7]}" height="26">` : '-';

    repData.push([
      status,
      formatDateUI(r[0]),
      `<span class="text-success fw-medium">${r[1] || '-'}</span>`,
      `<span class="text-danger fw-medium">${r[2] || '-'}</span>`,
      `<span class="fw-bold font-heading text-primary">${r[3] || '-'}</span>`,
      r[4] || '-',
      `${r[5]}<br><small class="text-muted">${r[8] || ''}</small>`,
      sig1,
      sig2
    ]);
  });

  updateDataTable('#tableOilReport', repData, [[1, 'desc']]);
  modalOilRep.show();
}

/* ==========================================================================
   10. Navigation & Authentication Router
   ========================================================================== */

function switchPage(pageId, linkElement = null) {
  // สลับการแสดงผล section
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  const targetPage = document.getElementById(pageId);
  if (targetPage) targetPage.classList.add('active');

  // สลับสถานะ active บน sidebar
  document.querySelectorAll('.app-sidebar .nav-link').forEach(el => el.classList.remove('active'));
  const sidebarMatch = document.querySelector(`.app-sidebar .nav-link[onclick*="${pageId}"]`);
  if (sidebarMatch) sidebarMatch.classList.add('active');

  // สลับสถานะ active บน bottom nav
  document.querySelectorAll('.bottom-nav-link').forEach(el => el.classList.remove('active'));
  const bottomMatch = document.querySelector(`.bottom-nav-link[onclick*="${pageId}"]`);
  if (bottomMatch) bottomMatch.classList.add('active');

  // ปิด sidebar บนมือถือเมื่อกดเปลี่ยนหน้า
  closeMobileSidebar();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // จัดการการโหลดและเรนเดอร์เฉพาะหน้า
  if (pageId === 'page-calendar') {
    if (!carCalendar) {
      initCalendar();
    } else {
      carCalendar.render();
    }
  } else if (pageId === 'page-dashboard') {
    if (!carDashboard) {
      initDashboard();
    } else {
      carDashboard.update();
    }
  } else if (pageId === 'page-oil') {
    if (oilHistoryList.length === 0) loadOilData(false);
  }
}

async function checkLoginAndSwitch(pageId, linkElement = null) {
  if (pageId === 'page-assign' && !unlockedAssign) {
    const { value: pass } = await Swal.fire({
      title: '🔑 จัดการระบบจัดรถ',
      input: 'password',
      inputPlaceholder: 'กรอกรหัสผ่าน (11278)',
      showCancelButton: true,
      confirmButtonText: 'ปลดล็อก'
    });
    if (!pass) return;

    try {
      const res = await callAPI('checkAuth', { type: 'assign', pass: pass });
      if (res.data === true) {
        unlockedAssign = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    } catch (e) {
      if (pass === window.CONFIG?.DEFAULT_PASSWORDS?.assign) {
        unlockedAssign = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    }
  }

  if (pageId === 'page-driver' && !unlockedDriver) {
    const { value: pass } = await Swal.fire({
      title: '👨‍✈️ รายงานสำหรับ พขร.',
      input: 'password',
      inputPlaceholder: 'กรอกรหัสผ่าน (1234)',
      showCancelButton: true,
      confirmButtonText: 'เข้าสู่ระบบ'
    });
    if (!pass) return;

    try {
      const res = await callAPI('checkAuth', { type: 'driver', pass: pass });
      if (res.data === true) {
        unlockedDriver = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    } catch (e) {
      if (pass === window.CONFIG?.DEFAULT_PASSWORDS?.driver) {
        unlockedDriver = true;
      } else {
        return Swal.fire('ผิดพลาด', 'รหัสผ่านไม่ถูกต้อง', 'error');
      }
    }
  }

  switchPage(pageId, linkElement);
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (sidebar && backdrop) {
    sidebar.classList.toggle('show');
    backdrop.classList.toggle('show');
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (sidebar && backdrop) {
    sidebar.classList.remove('show');
    backdrop.classList.remove('show');
  }
}

/* ==========================================================================
   11. Real-time Clock Widget
   ========================================================================== */

function startRealtimeClock() {
  const clockEl = document.getElementById('topbarClock');
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const d = now.getDate();
    const m = thaiMonths[now.getMonth()];
    const y = now.getFullYear() + 543;
    const hh = ('0' + now.getHours()).slice(-2);
    const mm = ('0' + now.getMinutes()).slice(-2);
    const ss = ('0' + now.getSeconds()).slice(-2);
    clockEl.textContent = `${d} ${m} ${y} • ${hh}:${mm}:${ss} น.`;
  };

  update();
  setInterval(update, 1000);
}

/* ==========================================================================
   12. Initialization on Window Load
   ========================================================================== */

function initCalendar() {
  carCalendar = new CarCalendar('calendar', {
    onEventClick: (id) => openView(id, true)
  });
  carCalendar.init();
  if (globalData.length > 0) {
    carCalendar.updateEvents(globalData);
  }
}

function initDashboard() {
  carDashboard = new CarDashboard();
  carDashboard.init(globalData);
}

window.addEventListener('DOMContentLoaded', () => {
  // Init Modals
  modalAssign = new bootstrap.Modal(document.getElementById('modalAssign'));
  modalDriver = new bootstrap.Modal(document.getElementById('modalDriver'));
  modalView = new bootstrap.Modal(document.getElementById('modalView'));
  modalOilReq = new bootstrap.Modal(document.getElementById('modalOilRequest'));
  modalOilPen = new bootstrap.Modal(document.getElementById('modalOilPending'));
  modalOilApp = new bootstrap.Modal(document.getElementById('modalOilApprove'));
  modalOilRep = new bootstrap.Modal(document.getElementById('modalOilReport'));

  // Init Signatures
  sigPad1 = new DigitalSignature('sigCanvas1');
  sigPad2 = new DigitalSignature('sigCanvas2');

  document.getElementById('modalOilRequest')?.addEventListener('shown.bs.modal', () => sigPad1?.resize());
  document.getElementById('modalOilApprove')?.addEventListener('shown.bs.modal', () => sigPad2?.resize());

  // Setup modules
  setupRequestForm();
  setupAssignForm();
  setupDriverForm();
  setupOilModule();
  startRealtimeClock();

  // Load Data
  loadOptions();
  loadData(true);
});
