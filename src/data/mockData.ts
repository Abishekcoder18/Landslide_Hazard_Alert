import {
  ApproachZone,
  AuditLogEntry,
  ClosureApproval,
  FieldReport,
  Incident,
  SafeHoldingPoint,
  Segment,
  StoryStepInfo
} from '../types';

export const INITIAL_SEGMENTS: Record<string, Segment> = {
  'S-01': {
    id: 'S-01',
    name: 'S-01 Lumding Boundary – Dayang',
    kmRange: 'km 110–118',
    startKm: 110,
    endKm: 118,
    coordinates: [
      [25.750, 93.170],
      [25.710, 93.175],
      [25.670, 93.180]
    ],
    center: [25.710, 93.175],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Low terrain gradient (8°)', 'Dry antecedent weather (24h: 4 mm)', 'No historical slope failures in 5 yrs'],
    freshness: '12m ago',
    validUntil: '5h 48m',
    inputs: {
      susceptibility: 'Low',
      slope: '8° valley floor',
      rainfall24h: 4,
      rainfall3d: 12,
      rainfall7d: 22,
      pastIncidents: 0,
      warnings: 'None active',
      freshness: '12m ago'
    },
    lengthKm: 8,
    elevationM: 210
  },
  'S-02': {
    id: 'S-02',
    name: 'S-02 Dayang – Langting',
    kmRange: 'km 118–127',
    startKm: 118,
    endKm: 127,
    coordinates: [
      [25.670, 93.180],
      [25.620, 93.182],
      [25.560, 93.178]
    ],
    center: [25.615, 93.181],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Gentle cutting slopes', 'Subsurface drainage cleared pre-monsoon', 'Low 7-day cumulative precipitation'],
    freshness: '18m ago',
    validUntil: '5h 42m',
    inputs: {
      susceptibility: 'Low',
      slope: '12° colluvial',
      rainfall24h: 8,
      rainfall3d: 18,
      rainfall7d: 31,
      pastIncidents: 1,
      warnings: 'None active',
      freshness: '18m ago'
    },
    lengthKm: 9,
    elevationM: 280
  },
  'S-03': {
    id: 'S-03',
    name: 'S-03 Langting – Dihamlai',
    kmRange: 'km 127–137',
    startKm: 127,
    endKm: 137,
    coordinates: [
      [25.560, 93.178],
      [25.480, 93.174],
      [25.410, 93.172]
    ],
    center: [25.485, 93.175],
    roadState: 'OPEN',
    riskLevel: 'YELLOW',
    reasons: ['Moderate slope cut along Langting river', 'Isolated minor gravel roll in 2024', 'Moderate 3-day rainfall (38 mm)'],
    freshness: '8m ago',
    validUntil: '5h 52m',
    inputs: {
      susceptibility: 'Moderate',
      slope: '22° weathered shale',
      rainfall24h: 18,
      rainfall3d: 38,
      rainfall7d: 64,
      pastIncidents: 2,
      warnings: 'Advisory watch',
      freshness: '8m ago'
    },
    lengthKm: 10,
    elevationM: 340
  },
  'S-04': {
    id: 'S-04',
    name: 'S-04 Dihamlai – Maibong',
    kmRange: 'km 137–146',
    startKm: 137,
    endKm: 146,
    coordinates: [
      [25.410, 93.172],
      [25.350, 93.171],
      [25.300, 93.169]
    ],
    center: [25.355, 93.170],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Engineered gabion retaining wall intact', 'Catchwater drain functional', 'Normal traffic throughput'],
    freshness: '22m ago',
    validUntil: '5h 38m',
    inputs: {
      susceptibility: 'Moderate',
      slope: '19° sandstone',
      rainfall24h: 14,
      rainfall3d: 32,
      rainfall7d: 55,
      pastIncidents: 1,
      warnings: 'None active',
      freshness: '22m ago'
    },
    lengthKm: 9,
    elevationM: 410
  },
  'S-05': {
    id: 'S-05',
    name: 'S-05 Maibong – Mahur',
    kmRange: 'km 146–156',
    startKm: 146,
    endKm: 156,
    coordinates: [
      [25.300, 93.169],
      [25.260, 93.135],
      [25.230, 93.100]
    ],
    center: [25.265, 93.134],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Haflong bypass plateau approach', 'Wide emergency shoulders', 'Stable geology (Surma group sandstone)'],
    freshness: '5m ago',
    validUntil: '5h 55m',
    inputs: {
      susceptibility: 'Low',
      slope: '15° stable dip',
      rainfall24h: 16,
      rainfall3d: 41,
      rainfall7d: 68,
      pastIncidents: 0,
      warnings: 'None active',
      freshness: '5m ago'
    },
    lengthKm: 10,
    elevationM: 520
  },
  'S-06': {
    id: 'S-06',
    name: 'S-06 Mahur – Haflong Hill',
    kmRange: 'km 156–166',
    startKm: 156,
    endKm: 166,
    coordinates: [
      [25.230, 93.100],
      [25.195, 93.060],
      [25.170, 93.020]
    ],
    center: [25.200, 93.060],
    roadState: 'OPEN',
    riskLevel: 'YELLOW',
    reasons: ['Steep ascent (28° slope cut)', 'Drainage scuppers partially silted', '3-day rainfall 55 mm'],
    freshness: '14m ago',
    validUntil: '5h 46m',
    inputs: {
      susceptibility: 'Moderate',
      slope: '28° fractured siltstone',
      rainfall24h: 24,
      rainfall3d: 55,
      rainfall7d: 89,
      pastIncidents: 2,
      warnings: 'Local advisory',
      freshness: '14m ago'
    },
    lengthKm: 10,
    elevationM: 680
  },
  'S-07': {
    id: 'S-07',
    name: 'S-07 Jatinga–Harangajao',
    kmRange: 'km 166–178',
    startKm: 166,
    endKm: 178,
    coordinates: [
      [25.170, 93.020],
      [25.140, 92.990],
      [25.110, 92.940],
      [25.070, 92.905],
      [25.050, 92.890]
    ],
    center: [25.110, 92.940],
    roadState: 'OPEN',
    riskLevel: 'YELLOW',
    reasons: [
      'High 3-day rainfall (scenario)',
      'High GSI susceptibility (Disang shale, 34° slope)',
      '4 past major failures (2022, 2024, 2025, 2026)'
    ],
    freshness: '2m ago',
    validUntil: '5h 58m',
    inputs: {
      susceptibility: 'High',
      slope: '34° highly sheared Disang shale',
      rainfall24h: 58,
      rainfall3d: 112,
      rainfall7d: 185,
      pastIncidents: 4,
      warnings: 'IMD Scenario Warning: Intense precipitation band approaching Dima Hasao',
      freshness: '2m ago'
    },
    windowClosing: true, // IMD warning on Yellow segment!
    lengthKm: 12,
    elevationM: 610
  },
  'S-08': {
    id: 'S-08',
    name: 'S-08 Harangajao – Dihangi',
    kmRange: 'km 178–187',
    startKm: 178,
    endKm: 187,
    coordinates: [
      [25.050, 92.890],
      [25.035, 92.870],
      [25.010, 92.845]
    ],
    center: [25.032, 92.868],
    roadState: 'OPEN',
    riskLevel: 'YELLOW',
    reasons: ['Harangajao river erosion near toe', 'Toe-wall scouring reported in 2025', 'Moderate 24h rainfall (29 mm)'],
    freshness: '9m ago',
    validUntil: '5h 51m',
    inputs: {
      susceptibility: 'Moderate',
      slope: '24° alluvial toe',
      rainfall24h: 29,
      rainfall3d: 62,
      rainfall7d: 98,
      pastIncidents: 1,
      warnings: 'River watch',
      freshness: '9m ago'
    },
    lengthKm: 9,
    elevationM: 390
  },
  'S-09': {
    id: 'S-09',
    name: 'S-09 Dihangi – Ditokcherra',
    kmRange: 'km 187–196',
    startKm: 187,
    endKm: 196,
    coordinates: [
      [25.010, 92.845],
      [24.970, 92.825],
      [24.935, 92.810]
    ],
    center: [24.972, 92.827],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Reinforced concrete viaduct section', 'Slope wire-mesh netting installed', 'Water runoff cleared'],
    freshness: '15m ago',
    validUntil: '5h 45m',
    inputs: {
      susceptibility: 'Low',
      slope: '16° stabilized',
      rainfall24h: 18,
      rainfall3d: 44,
      rainfall7d: 71,
      pastIncidents: 0,
      warnings: 'None active',
      freshness: '15m ago'
    },
    lengthKm: 9,
    elevationM: 310
  },
  'S-10': {
    id: 'S-10',
    name: 'S-10 Ditokcherra – Bandarkhal',
    kmRange: 'km 196–205',
    startKm: 196,
    endKm: 205,
    coordinates: [
      [24.935, 92.810],
      [24.900, 92.802],
      [24.870, 92.795]
    ],
    center: [24.902, 92.803],
    roadState: 'OPEN',
    riskLevel: 'NO_DATA',
    reasons: ['Optical fiber backhaul severed near railway tunnel', 'Patrol telemetry ping timed out', 'Treated as Yellow equivalence (failsafe)'],
    freshness: 'Telemetric outage (4h ago)',
    validUntil: 'Expired — verify with field patrol',
    inputs: {
      susceptibility: 'Moderate',
      slope: '20°',
      rainfall24h: 0,
      rainfall3d: 0,
      rainfall7d: 0,
      pastIncidents: 1,
      warnings: 'Sensor feed offline',
      freshness: '4h ago (offline)'
    },
    lengthKm: 9,
    elevationM: 220
  },
  'S-11': {
    id: 'S-11',
    name: 'S-11 Bandarkhal – Balacherra',
    kmRange: 'km 205–214',
    startKm: 205,
    endKm: 214,
    coordinates: [
      [24.870, 92.795],
      [24.850, 92.790],
      [24.835, 92.784]
    ],
    center: [24.852, 92.790],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Broad valley floor alignment', 'Culverts clear', 'Low gradient'],
    freshness: '7m ago',
    validUntil: '5h 53m',
    inputs: {
      susceptibility: 'Low',
      slope: '9° alluvial',
      rainfall24h: 12,
      rainfall3d: 28,
      rainfall7d: 48,
      pastIncidents: 0,
      warnings: 'None active',
      freshness: '7m ago'
    },
    lengthKm: 9,
    elevationM: 150
  },
  'S-12': {
    id: 'S-12',
    name: 'S-12 Balacherra – Silchar Border',
    kmRange: 'km 214–222',
    startKm: 214,
    endKm: 222,
    coordinates: [
      [24.835, 92.784],
      [24.820, 92.778],
      [24.805, 92.772]
    ],
    center: [24.820, 92.778],
    roadState: 'OPEN',
    riskLevel: 'GREEN',
    reasons: ['Plain section entry to Cachar valley', 'Four-lane divided carriageway', 'No slope cut hazards'],
    freshness: '11m ago',
    validUntil: '5h 49m',
    inputs: {
      susceptibility: 'Very Low',
      slope: '4° plain',
      rainfall24h: 10,
      rainfall3d: 22,
      rainfall7d: 39,
      pastIncidents: 0,
      warnings: 'None active',
      freshness: '11m ago'
    },
    lengthKm: 8,
    elevationM: 85
  }
};

export const INITIAL_HOLDING_POINTS: Record<string, SafeHoldingPoint> = {
  'HP-HAFLONG': {
    id: 'HP-HAFLONG',
    name: 'Haflong Safe Holding Area',
    locationName: 'Haflong Junction Staging Area',
    facilities: [
      'Food & Tea Canteens',
      'Fuel Bunk (Petrol/Diesel)',
      'Covered Dormitory Shelter (150 beds)',
      'Heavy Freight Parking (80 slots)',
      '24/7 Medical Post & First Aid',
      'Drinking Water Tankers',
      'Satellite Emergency Phone'
    ],
    segmentId: 'S-05',
    capacityVehicles: 250,
    currentOccupancy: 38,
    statusNote: 'Operational · Host segment S-05 OPEN & GREEN'
  },
  'HP-LUMDING': {
    id: 'HP-LUMDING',
    name: 'Lumding Safe Staging Area',
    locationName: 'Lumding Toll Plaza Safe Zone',
    facilities: [
      'Community Kitchen & Food',
      'Fuel Station (Indian Oil)',
      'Traveller Rest Sheds',
      'Commercial Truck Lay-by (120 trucks)',
      'Highway Patrol Post',
      'Sanitation Units'
    ],
    segmentId: 'S-01',
    capacityVehicles: 350,
    currentOccupancy: 62,
    statusNote: 'Operational · Fallback staging point'
  },
  'HP-SILCHAR': {
    id: 'HP-SILCHAR',
    name: 'Silchar-Side Staging Point',
    locationName: 'Balacherra Highway Staging (to be confirmed with district)',
    facilities: [
      'Basic Covered Waiting Shed',
      'Mobile Drinking Water Tanker',
      'Emergency Police Outpost',
      'Vehicle Parking Bay (60 slots)'
    ],
    segmentId: 'S-12',
    capacityVehicles: 120,
    currentOccupancy: 15,
    statusNote: 'Provisional staging point · District nod pending'
  }
};

export const INITIAL_APPROACH_ZONES: ApproachZone[] = [
  {
    id: 'AZ-07N',
    name: 'AZ-07N from Haflong side',
    direction: 'Southbound',
    segmentId: 'S-07',
    targetSegmentName: 'S-07 Jatinga–Harangajao',
    nearestHoldingPointId: 'HP-HAFLONG',
    fallbackHoldingPointIds: ['HP-LUMDING'],
    locationKm: 'km 164.5 (2 km before danger zone)',
    diversionRoutes: [
      {
        name: 'Old Haflong–Ditokcherra Link Road (Scenario Diversion)',
        description: 'Bypasses Jatinga via rural hills to rejoin at S-10 Bandarkhal',
        segmentIds: ['S-10'] // Notice S-10 has NO_DATA! So this diversion will be checked and rejected!
      }
    ]
  },
  {
    id: 'AZ-07S',
    name: 'AZ-07S from Silchar side',
    direction: 'Northbound',
    segmentId: 'S-07',
    targetSegmentName: 'S-07 Jatinga–Harangajao',
    nearestHoldingPointId: 'HP-SILCHAR',
    locationKm: 'km 179.8 (1.8 km before danger zone)',
    diversionRoutes: [
      {
        name: 'Lower Barak Forest Track (Scenario Diversion)',
        description: 'Unpaved emergency detour connecting Harangajao to Mahur via forest corridor',
        segmentIds: ['S-08', 'S-10'] // Also connects to S-10 (No-data) -> safe rejection
      }
    ]
  },
  {
    id: 'AZ-06N',
    name: 'AZ-06N from Maibong side',
    direction: 'Southbound',
    segmentId: 'S-06',
    targetSegmentName: 'S-06 Mahur–Haflong Hill',
    nearestHoldingPointId: 'HP-HAFLONG',
    fallbackHoldingPointIds: ['HP-LUMDING'],
    locationKm: 'km 154.2',
    diversionRoutes: []
  },
  {
    id: 'AZ-03S',
    name: 'AZ-03S from Dihamlai',
    direction: 'Northbound',
    segmentId: 'S-03',
    targetSegmentName: 'S-03 Langting–Dihamlai',
    nearestHoldingPointId: 'HP-LUMDING',
    locationKm: 'km 138.5',
    diversionRoutes: []
  }
];

export const INITIAL_REPORTS: FieldReport[] = [
  {
    id: 'REP-2026-104',
    timestamp: '09:42 AM',
    submitterRole: 'Highway Patrol Unit 3 (HP-03)',
    locationText: 'Near Jatinga bend, S-07 (km 168.4)',
    segmentId: 'S-07',
    photoUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80', // landslide / rock debris placeholder
    notes: 'Large mudflow and boulder slip across both lanes following 45-min cloudburst. Trees downed over power lines. Completely impassable for all vehicles.',
    aiClassification: {
      hazardClass: 'Debris & mudflow on road',
      blockagePercent: 100,
      confidence: 0.91,
      suggestion: 'Road blocked ~100% · Immediate closure recommended'
    },
    checks: {
      insideCorridor: true,
      recent: true,
      duplicateGroup: undefined
    },
    status: 'unverified'
  },
  {
    id: 'REP-2026-102',
    timestamp: '08:50 AM',
    submitterRole: 'Patrol Vehicle Lumding (HP-01)',
    locationText: 'S-02 Dayang cutting (km 122.1)',
    segmentId: 'S-02',
    photoUrl: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=800&q=80',
    notes: 'Routine corridor inspection. Side drains clear, culvert flowing freely. No slope cracks detected.',
    aiClassification: {
      hazardClass: 'Clear hill road',
      blockagePercent: 0,
      confidence: 0.98,
      suggestion: 'Normal conditions · No intervention needed'
    },
    checks: {
      insideCorridor: true,
      recent: true,
      duplicateGroup: undefined
    },
    status: 'confirmed',
    confirmedBy: 'Officer In-Charge (HQ)',
    confirmedAt: '08:55 AM'
  },
  {
    id: 'REP-2026-105',
    timestamp: '09:46 AM',
    submitterRole: 'Local Commuter (Verified App Report)',
    locationText: 'Jatinga km 168.6',
    segmentId: 'S-07',
    photoUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    notes: 'Road blocked by huge rocks and mud slurry. Trapped queue of 4 cars turning back toward Haflong.',
    aiClassification: {
      hazardClass: 'Debris on road',
      blockagePercent: 100,
      confidence: 0.89,
      suggestion: 'Duplicate event cluster detected (Group DUP-S07-A)'
    },
    checks: {
      insideCorridor: true,
      recent: true,
      duplicateGroup: 'DUP-S07-A (corroborates REP-2026-104)'
    },
    status: 'corroborated'
  }
];

export const INITIAL_INCIDENT: Incident = {
  id: 'INC-2026-088',
  segmentId: 'S-07',
  title: 'Jatinga–Harangajao Major Hill Debris & Mudflow',
  status: 'reported',
  reportedAt: '09:42 AM',
  reopeningEstimate: '4:00 PM',
  equipmentList: [
    'JCB 3DX Excavator (x2)',
    'CAT Front-end Wheel Loader (x1)',
    'Tipper Dump Trucks 10-wheel (x4)',
    'High-pressure Rock Slurry Jetter (x1)',
    'Heavy Tow Rig (x1)'
  ],
  notes: [
    '09:42 AM: Field report REP-2026-104 submitted by Highway Patrol 3.',
    '09:43 AM: AI computer vision classified 100% road blockage (confidence 0.91).',
    '09:44 AM: Awaiting officer confirmation to seal approach zones.'
  ]
};

export const INITIAL_APPROVAL: ClosureApproval = {
  id: 'APR-S07',
  segmentId: 'S-07',
  recommendedDecision: 'CLOSE',
  closureType: 'FULL',
  status: 'pending',
  escalationTimeRemainingSec: 600, // 10:00
  drafts: {
    en: 'NH-27 ALERT: Road BLOCKED between Jatinga and Harangajao (km 166–178) due to major landslide debris. ALL vehicles must HOLD at Haflong Safe Holding Area (north) or Silchar Staging (south). No safe diversion route exists. Estimated reopening ~4:00 PM (Estimate). Do not proceed past police checkpoints.',
    hi: 'राष्ट्रीय राजमार्ग 27 चेतावनी: जटिंगा और हरंगजाओ (किमी 166-178) के बीच भूस्खलन मलबे के कारण मार्ग पूर्णतः अवरुद्ध है। सभी वाहन हाफलोंग सुरक्षित विश्राम केंद्र (उत्तर) अथवा सिलचर स्टेजिंग (दक्षिण) पर रुकें। कोई सुरक्षित वैकल्पिक मार्ग उपलब्ध नहीं है। अनुमानित बहाली शाम 4:00 बजे (अनुमान)। आगे न बढ़ें।',
    as: 'এনএইচ-২৭ সতৰ্কবাণী: ভূমিস্খলনৰ বাবে জাতিংগা আৰু হাৰাংগাজাওৰ (কিমি ১৬৬-১৭৮) মাজৰ পথ সম্পূৰ্ণৰূপে বন্ধ হৈ পৰিছে। সকলো বাহন হাফলং সুৰক্ষিত স্থান (উত্তৰ) বা শিলচৰ ষ্টেজিঙত (দক্ষিণ) ৰখিবলৈ নিৰ্দেশ দিয়া হৈছে। কোনো সুৰক্ষিত বিকল্প পথ নাই। পথ পুনৰ মুকলিৰ আনুমানিক সময় বিয়লি ৪:০০ বজা (আনুমানিক)।',
    bn: 'এনএইচ-২৭ সতর্কতা: ভূমিধসের কারণে জাতিঙ্গা ও হারাঙ্গাজাওয়ের (কিমি ১৬৬-১৭৮) মধ্যবর্তী রাস্তা সম্পূর্ণ অবরুদ্ধ। সকল যানবাহনকে হাফলং নিরাপদ হোল্ডিং এলাকা (উত্তর) বা শিলচর স্টেজিং-এ (দক্ষিণ) থামার নির্দেশ দেওয়া হচ্ছে। কোনো নিরাপদ ডাইভারশন নেই। সম্ভাব্য খোলার সময় বিকেল ৪:০০ টা (আনুমানিক)।',
    dimasa: 'NH-27 Biyung Khabor: Jatinga aroni Harangajao gajao lama hado baiba gba khoro phan dong. Boto bo gari Haflong Safe Holding Area (north) ba Silchar Staging Area (south) ha thikhnani dong. Gasa lama dongya. Reopening estimate bela 4:00 PM (estimate).'
  },
  validation: {
    placesMatch: true,
    timesMatch: true,
    decisionMatch: true,
    blockedExample: {
      language: 'Unverified Automated Hindi Draft (Rejected by Validator)',
      error: 'CRITICAL MISMATCH: AI draft advised diverted route via unverified forest trail not approved by rule engine.',
      snippet: 'अस्वीकृत ड्राफ्ट: "...वाहन वन मार्ग से तुरंत निकल जाएं (DIVERT NOW)..." -> अस्वीकृत: स्वचालित सुरक्षा इंजन ने नो-डेटा खंड के कारण विचलन को खारिज किया।'
    }
  },
  capXml: `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>RESILION-2026-DIMA-S07-001</identifier>
  <sender>control-room@resilion.dima-hasao.gov.in</sender>
  <sent>2026-11-01T09:45:00+05:30</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <category>Safety</category>
    <event>Hill Road Landslide Closure</event>
    <urgency>Immediate</urgency>
    <severity>Severe</severity>
    <certainty>Observed</certainty>
    <eventCode>
      <valueName>RESILION_EVENT</valueName>
      <value>ROAD_BLOCKED_LANDSLIDE</value>
    </eventCode>
    <headline>NH-27 BLOCKED between Jatinga and Harangajao — HOLD at Haflong</headline>
    <description>Major mudflow and rock debris at km 168.4. Corridor completely impassable. All approaching vehicles must hold at designated holding points before the sector. No safe alternate diversion.</description>
    <instruction>Northbound vehicles hold at Silchar Staging. Southbound vehicles hold at Haflong Safe Holding Area. Await official clearance before proceeding.</instruction>
    <area>
      <areaDesc>Dima Hasao Corridor NH-27 km 164-180 (Geofence AZ-07N and AZ-07S)</areaDesc>
      <circle>25.110,92.940,6.0</circle>
    </area>
  </info>
</alert>`
};

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'AUD-001',
    timestamp: '08:00 AM',
    actorRole: 'System Cron',
    action: 'Telemetry Health Check',
    segmentId: 'All Segments (S-01 to S-12)',
    ruleUsed: 'SYS-HEALTH-POLL',
    beforeState: 'ACTIVE',
    afterState: 'ACTIVE (S-10 offline)',
    details: 'S-10 telemetry ping timeout; optical link severed. Failsafe activated: S-10 marked NO_DATA (Yellow equivalence).',
    verified: true
  },
  {
    id: 'AUD-002',
    timestamp: '08:15 AM',
    actorRole: 'Control-room Officer',
    action: 'Corridor Baseline Assessment',
    segmentId: 'S-07',
    ruleUsed: 'R-YELLOW-WINDOW-CLOSING',
    beforeState: 'GREEN',
    afterState: 'YELLOW (Window closing)',
    details: 'IMD Scenario Orange Warning ingested. Antecedent rainfall reaching 112 mm/3d. Window closing flag set for control console.',
    verified: true
  },
  {
    id: 'AUD-003',
    timestamp: '08:55 AM',
    actorRole: 'Control-room Officer',
    action: 'Report Confirmation',
    segmentId: 'S-02',
    ruleUsed: 'PATROL-CLEAR-ACK',
    beforeState: 'OPEN (GREEN)',
    afterState: 'OPEN (GREEN)',
    details: 'Confirmed routine clear patrol report REP-2026-102. Catchment drains verified functional.',
    verified: true
  }
];

export const STORY_STEPS: StoryStepInfo[] = [
  {
    step: 1,
    title: 'Story Home — The Problem',
    shortDesc: 'Understand historical hill failures & RESILION 2.0 paradigm shift.',
    route: '/',
    roleHint: 'control_officer'
  },
  {
    step: 2,
    title: 'Control Map — Rain Intensifies',
    shortDesc: 'Scenario rainfall elevates S-07 to Orange risk; window closing flag triggers.',
    route: '/control',
    roleHint: 'control_officer'
  },
  {
    step: 3,
    title: 'Decisions — HOLD Before Entry',
    shortDesc: 'Orange risk triggers failsafe rule: approach zones order HOLD before danger zone.',
    route: '/decisions',
    roleHint: 'control_officer'
  },
  {
    step: 4,
    title: 'Submit Field Report — Patrol Detects Mudflow',
    shortDesc: 'Highway Patrol uploads photo at km 168.4; AI drafts 100% blockage suggestion.',
    route: '/reports/new',
    roleHint: 'patrol'
  },
  {
    step: 5,
    title: 'Officer Report Queue — Confirmation',
    shortDesc: 'Officer confirms report; S-07 transitions to BLOCKED; automated re-evaluation.',
    route: '/reports',
    roleHint: 'control_officer'
  },
  {
    step: 6,
    title: 'Decisions — Holding Point & Diversion Check',
    shortDesc: 'Haflong holding area engaged; alternate routes checked & safely rejected.',
    route: '/decisions',
    roleHint: 'control_officer'
  },
  {
    step: 7,
    title: 'Approvals — Multi-Lingual Alert & CAP',
    shortDesc: 'Officer approves Full Closure; verified alerts in 5 languages; CAP XML exported.',
    route: '/approvals',
    roleHint: 'control_officer'
  },
  {
    step: 8,
    title: 'Traveller View — Safe Holding Display',
    shortDesc: 'Driver in approach zone sees clear instructions, Haflong facilities, and SMS query.',
    route: '/traveller',
    roleHint: 'traveller'
  },
  {
    step: 9,
    title: 'Incident Log — Clearance & Stepwise Reopening',
    shortDesc: 'Crew assigned, earthmovers clear lane; reopens one-way convoy, then full passage.',
    route: '/incidents/INC-2026-088',
    roleHint: 'road_engineer'
  },
  {
    step: 10,
    title: 'Audit Log — Immutable Chain of Custody',
    shortDesc: 'Every state transition, rule ID, and officer action verified in audit record.',
    route: '/audit',
    roleHint: 'admin'
  }
];
