/**
 * ระบบบริหารจัดการยานพาหนะและรถพยาบาล - โรงพยาบาลไทรโยค (Car 2)
 * การตั้งค่าระบบส่วนกลาง (Configuration)
 */

const CONFIG = {
  // URL Web App จาก Google Apps Script (เดิมจากโปรเจค car)
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxpjos1-CrNS9vRn0NNdISnMMujhVRklYtkZBgXLD2zi_RCJ8WoGFs-PhtziAlYFIGbRw/exec',

  // ข้อมูลหน่วยงาน
  HOSPITAL_NAME: 'โรงพยาบาลไทรโยค',
  APP_TITLE: 'ระบบบริหารจัดการยานพาหนะและรถพยาบาล',
  APP_SUBTITLE: 'Sai Yok Hospital Vehicle Management System',
  COPYRIGHT: '© 2026 โรงพยาบาลไทรโยค All Rights Reserved.',

  // เริ่มต้นปีงบประมาณ (เดือนตุลาคม = เดือน 10)
  FISCAL_START_MONTH: 10,

  // รหัสผ่านเริ่มต้น (ใช้ร่วมกับ API checkAuth)
  DEFAULT_PASSWORDS: {
    assign: '11278',
    driver: '1234',
    oil: '11278'
  },

  // ประเภทการใช้รถ (11 ประเภทตามระบบเดิม)
  CAR_USAGE_TYPES: [
    { id: 'meet_in', label: 'ประชุม/อบรม/ในจังหวัด', icon: 'bi-people', color: 'primary' },
    { id: 'meet_out', label: 'ประชุม/อบรม/ต่างจังหวัด', icon: 'bi-briefcase', color: 'indigo' },
    { id: 'lab_in', label: 'ส่ง lab ในจังหวัด', icon: 'bi-droplet', color: 'info' },
    { id: 'lab_out', label: 'ส่ง lab ต่างจังหวัด', icon: 'bi-eyedropper', color: 'cyan' },
    { id: 'mobile_unit', label: 'ออกหน่วยต่างๆ', icon: 'bi-hospital', color: 'teal' },
    { id: 'home_visit', label: 'เยี่ยมบ้าน', icon: 'bi-house-heart', color: 'success' },
    { id: 'refer_in', label: 'refer ในจังหวัด', icon: 'bi-truck', color: 'warning' },
    { id: 'refer_out', label: 'refer ต่างจังหวัด', icon: 'bi-truck-flatbed', color: 'orange' },
    { id: 'ems', label: 'EMS', icon: 'bi-shield-exclamation', color: 'danger' },
    { id: 'autopsy', label: 'ออกชันสูตร', icon: 'bi-journal-medical', color: 'purple' },
    { id: 'other', label: 'อื่นๆ', icon: 'bi-three-dots', color: 'secondary' }
  ],

  // สีสถานะ
  STATUS_COLORS: {
    pending: { label: 'รอจัดรถ', bg: '#ef4444', text: '#ffffff', badgeClass: 'badge-status-pending' },
    assigned: { label: 'รอขับรถ / กำลังไป', bg: '#f59e0b', text: '#1f2937', badgeClass: 'badge-status-assigned' },
    completed: { label: 'เดินทางเสร็จสิ้น', bg: '#10b981', text: '#ffffff', badgeClass: 'badge-status-completed' },
    cancelled: { label: 'ยกเลิก', bg: '#6b7280', text: '#ffffff', badgeClass: 'badge-status-cancelled' }
  }
};

// Export to window
window.CONFIG = CONFIG;
