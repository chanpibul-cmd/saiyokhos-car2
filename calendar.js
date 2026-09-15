/**
 * โมดูลปฏิทินคิวรถ (Interactive Calendar Module)
 * ใช้งานร่วมกับ FullCalendar 6 รองรับมุมมองหลากหลายและฟิลเตอร์สถานะ
 */

class CarCalendar {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.calendar = null;
    this.currentFilter = 'all'; // all, pending, assigned, completed, cancelled
    this.searchQuery = '';
    this.rawEvents = [];
    this.onEventClick = options.onEventClick || null;
  }

  init() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    const isMobile = window.innerWidth < 768;

    this.calendar = new FullCalendar.Calendar(el, {
      initialView: isMobile ? 'listWeek' : 'dayGridMonth',
      locale: 'th',
      themeSystem: 'bootstrap5',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: isMobile ? 'listWeek,dayGridMonth' : 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
      },
      buttonText: {
        today: 'วันนี้',
        month: 'เดือน',
        week: 'สัปดาห์',
        day: 'วัน',
        listMonth: 'รายการเดือน',
        listWeek: 'รายการสัปดาห์'
      },
      navLinks: true,
      nowIndicator: true,
      dayMaxEvents: 3,
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      },
      eventClick: (info) => {
        if (typeof this.onEventClick === 'function') {
          this.onEventClick(info.event.id);
        }
      },
      windowResize: (view) => {
        if (window.innerWidth < 768 && this.calendar.view.type === 'dayGridMonth') {
          this.calendar.changeView('listWeek');
        }
      }
    });

    this.calendar.render();
  }

  updateEvents(globalData) {
    if (!globalData || !Array.isArray(globalData)) return;

    this.rawEvents = globalData.filter(row => row && row[0]).map(row => {
      const id = String(row[0]);
      const start = row[4];
      const end = row[5];
      const requester = row[2] || '';
      const subject = row[6] || '';
      const place = row[7] || 'ไม่ระบุสถานที่';
      const driver = String(row[12] || '');
      const plate = row[13] ? String(row[13]) : '';
      const diffKm = row[19];

      // คำนวณสถานะ
      let statusKey = 'pending';
      let statusText = 'รอจัดรถ';
      let bgColor = '#ef4444'; // Red
      let textColor = '#ffffff';

      if (driver && driver.includes('ยกเลิก')) {
        statusKey = 'cancelled';
        statusText = 'ยกเลิก';
        bgColor = '#6b7280'; // Gray
      } else if (diffKm !== '' && diffKm !== null && diffKm !== undefined) {
        statusKey = 'completed';
        statusText = 'เสร็จสิ้น';
        bgColor = '#10b981'; // Green
      } else if (driver && driver.trim() !== '') {
        statusKey = 'assigned';
        statusText = 'รอขับรถ';
        bgColor = '#f59e0b'; // Amber
        textColor = '#1f2937';
      }

      const displayPlate = plate ? `(${plate})` : '(ยังไม่จัดรถ)';
      const title = `${place} ${displayPlate}`;

      return {
        id: id,
        title: title,
        start: start,
        end: end,
        backgroundColor: bgColor,
        borderColor: bgColor,
        textColor: textColor,
        extendedProps: {
          statusKey: statusKey,
          statusText: statusText,
          requester: requester,
          subject: subject,
          place: place,
          driver: driver,
          plate: plate,
          diffKm: diffKm
        }
      };
    });

    this.applyFilters();
    this.updateSummaryBadges();
  }

  setFilter(statusKey) {
    this.currentFilter = statusKey;
    this.applyFilters();
  }

  setSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.applyFilters();
  }

  applyFilters() {
    if (!this.calendar) return;

    const filtered = this.rawEvents.filter(ev => {
      // 1. กรองตามสถานะ
      if (this.currentFilter !== 'all') {
        if (ev.extendedProps.statusKey !== this.currentFilter) return false;
      }

      // 2. กรองตามข้อความค้นหา
      if (this.searchQuery) {
        const q = this.searchQuery;
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchReq = ev.extendedProps.requester.toLowerCase().includes(q);
        const matchSubj = ev.extendedProps.subject.toLowerCase().includes(q);
        const matchPlace = ev.extendedProps.place.toLowerCase().includes(q);
        const matchDriver = ev.extendedProps.driver.toLowerCase().includes(q);
        const matchPlate = ev.extendedProps.plate.toLowerCase().includes(q);
        const matchId = ev.id.toLowerCase().includes(q);
        if (!matchTitle && !matchReq && !matchSubj && !matchPlace && !matchDriver && !matchPlate && !matchId) {
          return false;
        }
      }

      return true;
    });

    this.calendar.removeAllEvents();
    this.calendar.addEventSource(filtered);
  }

  updateSummaryBadges() {
    let pendingCount = 0;
    let assignedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    let todayCount = 0;

    this.rawEvents.forEach(ev => {
      const k = ev.extendedProps.statusKey;
      if (k === 'pending') pendingCount++;
      else if (k === 'assigned') assignedCount++;
      else if (k === 'completed') completedCount++;
      else if (k === 'cancelled') cancelledCount++;

      if (ev.start && String(ev.start).slice(0, 10) === todayStr) {
        todayCount++;
      }
    });

    // อัปเดตตัวเลขบน UI
    const elPending = document.getElementById('calBadgePending');
    const elAssigned = document.getElementById('calBadgeAssigned');
    const elCompleted = document.getElementById('calBadgeCompleted');
    const elAll = document.getElementById('calBadgeAll');
    const elToday = document.getElementById('calBadgeToday');

    if (elPending) elPending.textContent = pendingCount;
    if (elAssigned) elAssigned.textContent = assignedCount;
    if (elCompleted) elCompleted.textContent = completedCount;
    if (elAll) elAll.textContent = this.rawEvents.length;
    if (elToday) elToday.textContent = todayCount;
  }

  render() {
    if (this.calendar) {
      setTimeout(() => {
        this.calendar.render();
      }, 50);
    }
  }

  changeView(viewName) {
    if (this.calendar) {
      this.calendar.changeView(viewName);
    }
  }
}

window.CarCalendar = CarCalendar;
