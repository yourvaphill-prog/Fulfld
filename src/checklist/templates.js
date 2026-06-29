export const TEMPLATES = {
  'Amazon PPC Campaign Launch': [
    { step_title: 'Kickoff call / brief received',      target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Set up campaign structure',           target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Keyword research complete',           target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Build ad groups and targeting',       target_day_label: 'Day 1–2', target_offset_days: 2,  hard_stop: false },
    { step_title: 'Budget and bid strategy set',         target_day_label: 'Day 2',   target_offset_days: 2,  hard_stop: false },
    { step_title: 'Campaign live — confirmed',           target_day_label: 'Day 3',   target_offset_days: 3,  hard_stop: true  },
    { step_title: 'First performance review',            target_day_label: 'Day 5–6', target_offset_days: 6,  hard_stop: false },
    { step_title: 'Optimization pass',                   target_day_label: 'Day 7',   target_offset_days: 7,  hard_stop: false },
  ],
  'Brand / ASIN Approval Process': [
    { step_title: 'Receive brand application',          target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Check brand gating status',          target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: true  },
    { step_title: 'Gather required documents',          target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Submit ungating application',        target_day_label: 'Day 1–2', target_offset_days: 2,  hard_stop: false },
    { step_title: 'Await Amazon approval',              target_day_label: 'Day 3–5', target_offset_days: 5,  hard_stop: false },
    { step_title: 'Approval confirmed',                 target_day_label: 'Day 5',   target_offset_days: 5,  hard_stop: true  },
    { step_title: 'Create ASINs / listings',            target_day_label: 'Day 6',   target_offset_days: 6,  hard_stop: false },
  ],
  'PO / Purchasing Workflow': [
    { step_title: 'Purchase order initiated',           target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Supplier confirmation received',     target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: true  },
    { step_title: 'Invoice reviewed and approved',      target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Payment processed',                  target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Shipment tracking confirmed',        target_day_label: 'Day 3–5', target_offset_days: 5,  hard_stop: false },
    { step_title: 'Receiving confirmation',             target_day_label: 'Day 7',   target_offset_days: 7,  hard_stop: false },
    { step_title: 'Quality check complete',             target_day_label: 'Day 8',   target_offset_days: 8,  hard_stop: true  },
    { step_title: 'Inventory updated',                  target_day_label: 'Day 9',   target_offset_days: 9,  hard_stop: false },
  ],
  'UPC Scan Workflow': [
    { step_title: 'UPC list received',                  target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Run UPC scan in scanner module',     target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Filter profitable ASINs',            target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Verify IP restrictions / gating',   target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Confirm pricing and profit margin',  target_day_label: 'Day 1–2', target_offset_days: 2,  hard_stop: true  },
    { step_title: 'Submit to buyer for approval',       target_day_label: 'Day 2',   target_offset_days: 2,  hard_stop: false },
    { step_title: 'PO created',                         target_day_label: 'Day 3',   target_offset_days: 3,  hard_stop: false },
  ],
  'Landing Page Launch': [
    { step_title: 'Content brief received',             target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: false },
    { step_title: 'Design assets finalized',            target_day_label: 'Day 0',   target_offset_days: 0,  hard_stop: true  },
    { step_title: 'Page built and reviewed',            target_day_label: 'Day 1',   target_offset_days: 1,  hard_stop: false },
    { step_title: 'Copy finalized',                     target_day_label: 'Day 1–2', target_offset_days: 2,  hard_stop: false },
    { step_title: 'QA / mobile check',                  target_day_label: 'Day 2',   target_offset_days: 2,  hard_stop: false },
    { step_title: 'DNS / redirect configured',          target_day_label: 'Day 3',   target_offset_days: 3,  hard_stop: false },
    { step_title: 'Go live',                            target_day_label: 'Day 3',   target_offset_days: 3,  hard_stop: true  },
    { step_title: 'Post-launch performance check',      target_day_label: 'Day 4',   target_offset_days: 4,  hard_stop: false },
  ],
};

export const TEMPLATE_NAMES   = Object.keys(TEMPLATES);
export const TASK_STATUSES    = ['Not Started', 'In Progress', 'Done', 'Blocked', 'Pass', 'Stop'];
export const PROJECT_STATUSES = ['Active', 'Completed', 'Passed', 'Stopped', 'Archived'];
