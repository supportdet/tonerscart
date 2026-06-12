"""TonersCart — curated printer ↔ toner/ink/drum compatibility database.

Single source of truth (backend). Printers list their compatible cartridge model
numbers; the toner catalogue is derived (inverse) so cross-reference is always
consistent, then enriched with brand/type metadata + standalone drums/inks.

Covers the major Indian-market models across HP, Canon, Epson, Brother, Ricoh,
Xerox, Kyocera, Samsung, Konica Minolta and Pantum. Curated, not exhaustive.
"""
import re
from functools import lru_cache

# (brand, model, type[laser|inkjet|mfd], [compatible cartridge model numbers])
PRINTERS_RAW = [
    # ============================== HP — LaserJet mono =====================
    ("HP", "LaserJet 1010", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1012", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1015", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1018", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1020", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1020 Plus", "laser", ["Q2612A"]),
    ("HP", "LaserJet 1022", "laser", ["Q2612A"]),
    ("HP", "LaserJet 3050", "mfd", ["Q2612A"]),
    ("HP", "LaserJet 3052", "mfd", ["Q2612A"]),
    ("HP", "LaserJet 3055", "mfd", ["Q2612A"]),
    ("HP", "LaserJet M1005 MFP", "mfd", ["Q2612A"]),
    ("HP", "LaserJet M1319f MFP", "mfd", ["Q2612A"]),
    ("HP", "LaserJet 1160", "laser", ["Q5949A"]),
    ("HP", "LaserJet 1320", "laser", ["Q5949A", "Q5949X"]),
    ("HP", "LaserJet 3390", "mfd", ["Q5949A"]),
    ("HP", "LaserJet 3392", "mfd", ["Q5949A"]),
    ("HP", "LaserJet P1005", "laser", ["CB435A"]),
    ("HP", "LaserJet P1006", "laser", ["CB435A"]),
    ("HP", "LaserJet P1007", "laser", ["CB435A"]),
    ("HP", "LaserJet P1008", "laser", ["CB436A"]),
    ("HP", "LaserJet P1106", "laser", ["CE285A"]),
    ("HP", "LaserJet P1108", "laser", ["CE285A"]),
    ("HP", "LaserJet M1136 MFP", "mfd", ["CE285A"]),
    ("HP", "LaserJet M1213nf MFP", "mfd", ["CE285A"]),
    ("HP", "LaserJet M1216nfh MFP", "mfd", ["CE285A"]),
    ("HP", "LaserJet Pro P1102", "laser", ["CE285A"]),
    ("HP", "LaserJet Pro P1102w", "laser", ["CE285A"]),
    ("HP", "LaserJet P2035", "laser", ["CE505A"]),
    ("HP", "LaserJet P2035n", "laser", ["CE505A"]),
    ("HP", "LaserJet P2055dn", "laser", ["CE505A", "CE505X"]),
    ("HP", "LaserJet Pro 400 M401dn", "laser", ["CF280A", "CF280X"]),
    ("HP", "LaserJet Pro 400 MFP M425dn", "mfd", ["CF280A"]),
    ("HP", "LaserJet Pro M201dw", "laser", ["CF400A"]),
    ("HP", "LaserJet Pro M202dw", "laser", ["CF500A"]),
    ("HP", "LaserJet Pro MFP M225dw", "mfd", ["CF283A"]),
    ("HP", "LaserJet Pro MFP M226dw", "mfd", ["CF226A"]),
    ("HP", "LaserJet Pro M12a", "laser", ["CF279A"]),
    ("HP", "LaserJet Pro M12w", "laser", ["CF279A"]),
    ("HP", "LaserJet Pro MFP M26a", "mfd", ["CF279A"]),
    ("HP", "LaserJet Pro MFP M26nw", "mfd", ["CF279A"]),
    ("HP", "LaserJet Pro M15a", "laser", ["CF248A"]),
    ("HP", "LaserJet Pro M15w", "laser", ["CF248A"]),
    ("HP", "LaserJet Pro MFP M28a", "mfd", ["CF248A"]),
    ("HP", "LaserJet Pro MFP M28w", "mfd", ["CF248A"]),
    ("HP", "LaserJet Pro M101", "laser", ["CF217A"]),
    ("HP", "LaserJet Pro M102a", "laser", ["CF217A"]),
    ("HP", "LaserJet Pro M102w", "laser", ["CF217A"]),
    ("HP", "LaserJet Pro MFP M130a", "mfd", ["CF217A"]),
    ("HP", "LaserJet Pro MFP M130fn", "mfd", ["CF217A"]),
    ("HP", "LaserJet Pro MFP M130fw", "mfd", ["CF217A"]),
    ("HP", "LaserJet Pro MFP M130nw", "mfd", ["CF217A"]),
    ("HP", "LaserJet Pro M203dn", "laser", ["CF230A", "CF230X"]),
    ("HP", "LaserJet Pro M203dw", "laser", ["CF230A"]),
    ("HP", "LaserJet Pro MFP M227fdw", "mfd", ["CF230A"]),
    ("HP", "LaserJet Pro MFP M227sdn", "mfd", ["CF230A"]),
    ("HP", "LaserJet Pro M404dn", "laser", ["CF259A", "CF259X"]),
    ("HP", "LaserJet Pro M404dw", "laser", ["CF259A"]),
    ("HP", "LaserJet Pro MFP M428fdw", "mfd", ["CF259A"]),
    ("HP", "LaserJet Pro MFP M428dw", "mfd", ["CF259A"]),
    ("HP", "LaserJet Enterprise M507dn", "laser", ["CF289A", "CF289X"]),
    ("HP", "LaserJet Enterprise MFP M528dn", "mfd", ["CF289A"]),
    ("HP", "LaserJet Pro M118dw", "laser", ["CF294A"]),
    ("HP", "LaserJet Pro MFP M148dw", "mfd", ["CF294A"]),
    ("HP", "LaserJet 2300", "laser", ["Q2610A"]),
    ("HP", "LaserJet 2420", "laser", ["Q6511A"]),
    ("HP", "LaserJet 2430", "laser", ["Q6511A", "Q6511X"]),
    ("HP", "LaserJet P3005", "laser", ["Q7551A", "Q7551X"]),
    ("HP", "LaserJet P3015", "laser", ["CE255A", "CE255X"]),
    ("HP", "LaserJet Enterprise M806", "laser", ["CF325X"]),
    ("HP", "LaserJet 4250", "laser", ["Q5942A", "Q5942X"]),
    ("HP", "LaserJet 4350", "laser", ["Q5942A"]),
    ("HP", "LaserJet 5200", "laser", ["Q7516A"]),
    ("HP", "Neverstop Laser 1000a", "laser", ["W1103A"]),
    ("HP", "Neverstop Laser 1000w", "laser", ["W1103A"]),
    ("HP", "Neverstop Laser MFP 1200a", "mfd", ["W1103A"]),
    ("HP", "Neverstop Laser MFP 1200w", "mfd", ["W1103A"]),
    # ============================== HP — Color LaserJet ====================
    ("HP", "Color LaserJet Pro M254dw", "laser", ["CF500A", "CF501A", "CF502A", "CF503A"]),
    ("HP", "Color LaserJet Pro MFP M281fdw", "mfd", ["CF500A", "CF501A", "CF502A", "CF503A"]),
    ("HP", "Color LaserJet Pro M255dw", "laser", ["W2110A", "W2111A", "W2112A", "W2113A"]),
    ("HP", "Color LaserJet Pro MFP M283fdw", "mfd", ["W2110A", "W2111A", "W2112A", "W2113A"]),
    ("HP", "Color LaserJet Pro M252dw", "laser", ["CF400A", "CF401A", "CF402A", "CF403A"]),
    ("HP", "Color LaserJet Pro MFP M277dw", "mfd", ["CF400A", "CF401A", "CF402A", "CF403A"]),
    ("HP", "Color LaserJet Pro CP1025", "laser", ["CE310A", "CE311A", "CE312A", "CE313A"]),
    ("HP", "Color LaserJet Pro 200 M251nw", "laser", ["CF210A", "CF211A", "CF212A", "CF213A"]),
    ("HP", "Color LaserJet CP2025", "laser", ["CC530A", "CC531A", "CC532A", "CC533A"]),
    ("HP", "Color LaserJet CM2320 MFP", "mfd", ["CC530A", "CC531A", "CC532A", "CC533A"]),
    ("HP", "Color LaserJet Pro M452dn", "laser", ["CF410A", "CF411A", "CF412A", "CF413A"]),
    ("HP", "Color LaserJet Pro MFP M477fdw", "mfd", ["CF410A", "CF411A", "CF412A", "CF413A"]),
    ("HP", "Color LaserJet CP1215", "laser", ["CB540A", "CB541A", "CB542A", "CB543A"]),
    ("HP", "Color LaserJet CM1312 MFP", "mfd", ["CB540A", "CB541A", "CB542A", "CB543A"]),
    # ============================== HP — Inkjet / Ink Tank =================
    ("HP", "DeskJet 1112", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet 2131", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet 2132", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet 1115", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet 3635", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet 2331", "inkjet", ["1WD18AA", "1WD17AA"]),
    ("HP", "DeskJet 2776", "inkjet", ["1WD18AA", "1WD17AA"]),
    ("HP", "OfficeJet 200", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "DeskJet Ink Advantage 3776", "inkjet", ["F6V28AA", "F6V26AA"]),
    ("HP", "OfficeJet Pro 6960", "inkjet", ["F6U16AA", "F6U17AA", "F6U18AA", "F6U19AA"]),
    ("HP", "OfficeJet Pro 7740", "inkjet", ["F6U16AA", "F6U17AA", "F6U18AA", "F6U19AA"]),
    ("HP", "OfficeJet Pro 8210", "inkjet", ["T6L99AA", "T6L91AA", "T6L95AA", "T6L93AA"]),
    ("HP", "Smart Tank 515", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 615", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 580", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 720", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 750", "inkjet", ["GT53", "GT52"]),
    ("HP", "Ink Tank 315", "inkjet", ["GT51", "GT52"]),
    ("HP", "Ink Tank 319", "inkjet", ["GT51", "GT52"]),
    ("HP", "Ink Tank 419", "inkjet", ["GT51", "GT52"]),
    ("HP", "Ink Tank Wireless 415", "inkjet", ["GT51", "GT52"]),
    ("HP", "Ink Tank 116", "inkjet", ["GT51", "GT52"]),
    ("HP", "DeskJet GT 5810", "inkjet", ["GT51", "GT52"]),
    ("HP", "DeskJet GT 5820", "inkjet", ["GT51", "GT52"]),

    # ============================== Canon — laser =========================
    ("Canon", "imageCLASS LBP2900B", "laser", ["303", "FX-9"]),
    ("Canon", "imageCLASS LBP2900", "laser", ["303"]),
    ("Canon", "imageCLASS LBP3000", "laser", ["303"]),
    ("Canon", "imageCLASS LBP6000", "laser", ["325"]),
    ("Canon", "imageCLASS LBP6018B", "laser", ["325"]),
    ("Canon", "imageCLASS LBP6018L", "laser", ["325"]),
    ("Canon", "imageCLASS LBP6030", "laser", ["325"]),
    ("Canon", "imageCLASS LBP6230dn", "laser", ["326"]),
    ("Canon", "imageCLASS LBP151dw", "laser", ["337"]),
    ("Canon", "imageCLASS MF3010", "mfd", ["325"]),
    ("Canon", "imageCLASS MF4320d", "mfd", ["328", "FX-10"]),
    ("Canon", "imageCLASS MF4350d", "mfd", ["328"]),
    ("Canon", "imageCLASS MF4412", "mfd", ["328"]),
    ("Canon", "imageCLASS MF4420w", "mfd", ["328"]),
    ("Canon", "imageCLASS MF4450", "mfd", ["328"]),
    ("Canon", "imageCLASS MF4570dw", "mfd", ["328"]),
    ("Canon", "imageCLASS MF4720w", "mfd", ["328"]),
    ("Canon", "imageCLASS MF221d", "mfd", ["337"]),
    ("Canon", "imageCLASS MF226dn", "mfd", ["337"]),
    ("Canon", "imageCLASS MF229dw", "mfd", ["337"]),
    ("Canon", "imageCLASS MF236n", "mfd", ["337"]),
    ("Canon", "imageCLASS MF241d", "mfd", ["337"]),
    ("Canon", "imageCLASS MF244dw", "mfd", ["337"]),
    ("Canon", "imageCLASS MF249dw", "mfd", ["337"]),
    ("Canon", "imageCLASS LBP161dn", "laser", ["319"]),
    ("Canon", "imageCLASS LBP162dw", "laser", ["319"]),
    ("Canon", "imageCLASS LBP223dw", "laser", ["057"]),
    ("Canon", "imageCLASS LBP226dw", "laser", ["057"]),
    ("Canon", "imageCLASS LBP228dw", "laser", ["057"]),
    ("Canon", "imageCLASS MF272dw", "mfd", ["057"]),
    ("Canon", "imageCLASS MF275dw", "mfd", ["057"]),
    ("Canon", "imageCLASS MF3010 II", "mfd", ["325"]),
    ("Canon", "imageCLASS LBP712Cx", "laser", ["046"]),
    ("Canon", "i-SENSYS LBP7018C", "laser", ["329"]),
    ("Canon", "imageCLASS MF8280Cw", "mfd", ["318"]),
    # ============================== Canon — inkjet (PIXMA) =================
    ("Canon", "PIXMA MG2570S", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA MG2577S", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA MG3070S", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA TS207", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA TS307", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA E410", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA E477", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "PIXMA iP2770", "inkjet", ["PG-810", "CL-811"]),
    ("Canon", "PIXMA MP237", "inkjet", ["PG-810", "CL-811"]),
    ("Canon", "PIXMA MP287", "inkjet", ["PG-810", "CL-811"]),
    ("Canon", "PIXMA G1010", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G2010", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G2012", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G3000", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G3010", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G4010", "inkjet", ["GI-790"]),
    ("Canon", "PIXMA G1020", "inkjet", ["GI-71"]),
    ("Canon", "PIXMA G2020", "inkjet", ["GI-71"]),
    ("Canon", "PIXMA G3020", "inkjet", ["GI-71"]),
    ("Canon", "PIXMA G570", "inkjet", ["GI-73"]),
    ("Canon", "PIXMA G670", "inkjet", ["GI-73"]),

    # ============================== Brother — laser =======================
    ("Brother", "HL-1110", "laser", ["TN-1020", "DR-1020"]),
    ("Brother", "HL-1111", "laser", ["TN-1020", "DR-1020"]),
    ("Brother", "HL-1201", "laser", ["TN-1020", "DR-1020"]),
    ("Brother", "HL-1211W", "laser", ["TN-1020", "DR-1020"]),
    ("Brother", "DCP-1510", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "DCP-1514", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "DCP-1601", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "DCP-1616NW", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "MFC-1810", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "MFC-1815", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "MFC-1906", "mfd", ["TN-1020", "DR-1020"]),
    ("Brother", "HL-2130", "laser", ["TN-2130", "DR-2125"]),
    ("Brother", "HL-2240", "laser", ["TN-2260", "DR-2225"]),
    ("Brother", "HL-2250DN", "laser", ["TN-2260", "DR-2225"]),
    ("Brother", "HL-L2321D", "laser", ["TN-2305", "DR-2305"]),
    ("Brother", "HL-L2351DW", "laser", ["TN-2355", "DR-2355"]),
    ("Brother", "HL-L2361DN", "laser", ["TN-2355", "DR-2355"]),
    ("Brother", "HL-L2366DW", "laser", ["TN-2355", "DR-2355"]),
    ("Brother", "DCP-L2520D", "mfd", ["TN-2305", "DR-2305"]),
    ("Brother", "DCP-L2521DW", "mfd", ["TN-2355", "DR-2355"]),
    ("Brother", "DCP-L2541DW", "mfd", ["TN-2355", "DR-2355"]),
    ("Brother", "MFC-L2701D", "mfd", ["TN-2305", "DR-2305"]),
    ("Brother", "MFC-L2701DW", "mfd", ["TN-2305", "DR-2305"]),
    ("Brother", "MFC-L2703DW", "mfd", ["TN-2355", "DR-2355"]),
    ("Brother", "DCP-L2531DW", "mfd", ["TN-2355", "DR-2355"]),
    ("Brother", "HL-L2375DW", "laser", ["TN-2480", "DR-2480"]),
    ("Brother", "DCP-L2535DW", "mfd", ["TN-2480", "DR-2480"]),
    ("Brother", "MFC-L2715DW", "mfd", ["TN-2480", "DR-2480"]),
    ("Brother", "HL-L3270CDW", "laser", ["TN-263BK", "TN-263C", "TN-263M", "TN-263Y"]),
    ("Brother", "DCP-L3551CDW", "mfd", ["TN-263BK", "TN-263C", "TN-263M", "TN-263Y"]),
    ("Brother", "MFC-L3770CDW", "mfd", ["TN-267BK", "TN-267C", "TN-267M", "TN-267Y"]),
    # Brother — newer HL / DCP / MFC mono laser (2023-2026 India launch)
    # Use TN-B021 (1.2K standard) / TN-B026 (2.6K) and matching DR-B023 drum.
    ("Brother", "HL-L2400DW", "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "HL-L2402D",  "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "HL-L2442DW", "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "HL-L2460DN", "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "HL-L2461DW", "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "HL-L2865DW", "laser", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "DCP-L2540DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "DCP-L2542DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "DCP-L2640DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "DCP-L2680DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "MFC-L2820DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    ("Brother", "MFC-L2880DW", "mfd", ["TN-B021", "TN-B026", "DR-B023"]),
    # Brother — newer colour laser (2024-2026 line, TN-273/277 family)
    ("Brother", "HL-L3220CDW", "laser", ["TN-273BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "HL-L3240CDW", "laser", ["TN-273BK", "TN-277BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "HL-L3280CDW", "laser", ["TN-273BK", "TN-277BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "DCP-L3520CDW", "mfd", ["TN-273BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "DCP-L3560CDW", "mfd", ["TN-273BK", "TN-277BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "MFC-L3760CDW", "mfd", ["TN-273BK", "TN-277BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "MFC-L3780CDW", "mfd", ["TN-273BK", "TN-277BK", "TN-273C", "TN-273M", "TN-273Y", "DR-273CL"]),
    ("Brother", "HL-5440D", "laser", ["TN-3320", "DR-3215"]),
    ("Brother", "HL-5450DN", "laser", ["TN-3380", "DR-3215"]),
    ("Brother", "MFC-8910DW", "mfd", ["TN-3320", "DR-3215"]),
    # ============================== Brother — inkjet ======================
    ("Brother", "DCP-T220", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T420W", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T520W", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T720DW", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T820DW", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "MFC-T920DW", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T310", "inkjet", ["BTD60BK", "BT5000C", "BT5000M", "BT5000Y"]),
    ("Brother", "DCP-T510W", "inkjet", ["BTD60BK", "BT5000C", "BT5000M", "BT5000Y"]),
    ("Brother", "DCP-T710W", "inkjet", ["BTD60BK", "BT5000C", "BT5000M", "BT5000Y"]),

    # ============================== Epson — EcoTank / ink =================
    ("Epson", "EcoTank L3110", "inkjet", ["003"]),
    ("Epson", "EcoTank L3150", "inkjet", ["003"]),
    ("Epson", "EcoTank L3115", "inkjet", ["003"]),
    ("Epson", "EcoTank L3116", "inkjet", ["003"]),
    ("Epson", "EcoTank L3210", "inkjet", ["003"]),
    ("Epson", "EcoTank L3211", "inkjet", ["003"]),
    ("Epson", "EcoTank L3216", "inkjet", ["003"]),
    ("Epson", "EcoTank L3250", "inkjet", ["003"]),
    ("Epson", "EcoTank L3252", "inkjet", ["003"]),
    ("Epson", "EcoTank L3256", "inkjet", ["003"]),
    ("Epson", "EcoTank L5190", "inkjet", ["003"]),
    ("Epson", "EcoTank L5290", "inkjet", ["003"]),
    # Epson EcoTank — 2023-2026 India launches (003 family is the universal
    # 4-colour ink set used across the L3xxx-L6xxx range).
    ("Epson", "EcoTank L3260", "inkjet", ["003"]),
    ("Epson", "EcoTank L3266", "inkjet", ["003"]),
    ("Epson", "EcoTank L3268", "inkjet", ["003"]),
    ("Epson", "EcoTank L3270", "inkjet", ["003"]),
    ("Epson", "EcoTank L3276", "inkjet", ["003"]),
    ("Epson", "EcoTank L4260", "inkjet", ["003"]),
    ("Epson", "EcoTank L4267", "inkjet", ["003"]),
    ("Epson", "EcoTank L4269", "inkjet", ["003"]),
    ("Epson", "EcoTank L6260", "inkjet", ["003"]),
    ("Epson", "EcoTank L6270", "inkjet", ["003"]),
    ("Epson", "EcoTank L6290", "inkjet", ["003"]),
    ("Epson", "EcoTank L15150", "inkjet", ["008"]),
    ("Epson", "EcoTank L15160", "inkjet", ["008"]),
    ("Epson", "EcoTank L18050", "inkjet", ["008"]),
    ("Epson", "EcoTank L11160", "inkjet", ["008"]),
    ("Epson", "EcoTank L130", "inkjet", ["664"]),
    ("Epson", "EcoTank L210", "inkjet", ["664"]),
    ("Epson", "EcoTank L220", "inkjet", ["664"]),
    ("Epson", "EcoTank L310", "inkjet", ["664"]),
    ("Epson", "EcoTank L360", "inkjet", ["664"]),
    ("Epson", "EcoTank L365", "inkjet", ["664"]),
    ("Epson", "EcoTank L380", "inkjet", ["664"]),
    ("Epson", "EcoTank L385", "inkjet", ["664"]),
    ("Epson", "EcoTank L405", "inkjet", ["664"]),
    ("Epson", "EcoTank L485", "inkjet", ["664"]),
    ("Epson", "EcoTank L565", "inkjet", ["664"]),
    ("Epson", "EcoTank L1300", "inkjet", ["664"]),
    ("Epson", "EcoTank L4150", "inkjet", ["003"]),
    ("Epson", "EcoTank L4160", "inkjet", ["003"]),
    ("Epson", "EcoTank L6170", "inkjet", ["008"]),
    ("Epson", "EcoTank L6190", "inkjet", ["008"]),
    ("Epson", "EcoTank L6290", "inkjet", ["008"]),
    ("Epson", "EcoTank L15150", "inkjet", ["008"]),
    ("Epson", "EcoTank L1110", "inkjet", ["003"]),
    ("Epson", "EcoTank L1210", "inkjet", ["003"]),
    ("Epson", "EcoTank M100", "inkjet", ["774"]),
    ("Epson", "EcoTank M105", "inkjet", ["774"]),
    ("Epson", "EcoTank M200", "inkjet", ["774"]),
    ("Epson", "EcoTank M205", "inkjet", ["774"]),
    ("Epson", "EcoTank L805", "inkjet", ["673"]),
    ("Epson", "EcoTank L850", "inkjet", ["673"]),
    ("Epson", "EcoTank L1800", "inkjet", ["673"]),
    # ============================== Epson — dot matrix ====================
    ("Epson", "LX-300+II", "dotmatrix", ["S015641"]),
    ("Epson", "LX-310", "dotmatrix", ["S015641"]),
    ("Epson", "LQ-310", "dotmatrix", ["S015639"]),
    ("Epson", "LQ-2090", "dotmatrix", ["S015336"]),
    ("Epson", "FX-890", "dotmatrix", ["S015329"]),

    # ============================== Ricoh =================================
    ("Ricoh", "SP 111", "laser", ["SP 111"]),
    ("Ricoh", "SP 111SU", "mfd", ["SP 111"]),
    ("Ricoh", "SP 200", "laser", ["SP 200"]),
    ("Ricoh", "SP 200N", "laser", ["SP 200"]),
    ("Ricoh", "SP 200S", "mfd", ["SP 200"]),
    ("Ricoh", "SP 210", "laser", ["SP 210"]),
    ("Ricoh", "SP 210SU", "mfd", ["SP 210"]),
    ("Ricoh", "SP 210SF", "mfd", ["SP 210"]),
    ("Ricoh", "SP 212Nw", "laser", ["SP 212"]),
    ("Ricoh", "SP 220Nw", "laser", ["SP 220"]),
    ("Ricoh", "SP 230DNw", "laser", ["SP 230"]),
    ("Ricoh", "SP 310DN", "laser", ["SP 310"]),
    ("Ricoh", "SP 311DN", "laser", ["SP 311"]),
    ("Ricoh", "SP 311SFNw", "mfd", ["SP 311"]),
    ("Ricoh", "SP 325DNw", "laser", ["SP 325"]),
    ("Ricoh", "SP 3500N", "laser", ["SP 3500"]),
    ("Ricoh", "SP 3510DN", "laser", ["SP 3500"]),
    ("Ricoh", "SP 3600DN", "laser", ["SP 3600"]),
    ("Ricoh", "SP 4510DN", "laser", ["SP 4500"]),
    ("Ricoh", "Aficio SP 100", "laser", ["SP 100"]),
    ("Ricoh", "MP 2014", "mfd", ["MP 2014"]),
    ("Ricoh", "MP 301", "mfd", ["MP 301"]),

    # ============================== Xerox =================================
    ("Xerox", "Phaser 3020", "laser", ["106R02773"]),
    ("Xerox", "WorkCentre 3025", "mfd", ["106R02773"]),
    ("Xerox", "Phaser 3052", "laser", ["106R02778"]),
    ("Xerox", "Phaser 3260", "laser", ["106R02778"]),
    ("Xerox", "WorkCentre 3215", "mfd", ["106R02778"]),
    ("Xerox", "WorkCentre 3225", "mfd", ["106R02778"]),
    ("Xerox", "Phaser 3010", "laser", ["106R02182"]),
    ("Xerox", "Phaser 3040", "laser", ["106R02182"]),
    ("Xerox", "WorkCentre 3045", "mfd", ["106R02182"]),
    ("Xerox", "B210", "laser", ["106R04347"]),
    ("Xerox", "B205", "mfd", ["106R04347"]),
    ("Xerox", "B215", "mfd", ["106R04347"]),
    ("Xerox", "Phaser 3100MFP", "mfd", ["106R01379"]),
    ("Xerox", "Phaser 3117", "laser", ["106R01159"]),
    ("Xerox", "Phaser 3124", "laser", ["106R01159"]),
    ("Xerox", "WorkCentre 3119", "mfd", ["013R00625"]),

    # ============================== Kyocera ===============================
    ("Kyocera", "ECOSYS P2040dn", "laser", ["TK-3160"]),
    ("Kyocera", "ECOSYS P2235dn", "laser", ["TK-1150"]),
    ("Kyocera", "ECOSYS P2235dw", "laser", ["TK-1150"]),
    ("Kyocera", "ECOSYS M2040dn", "mfd", ["TK-1150"]),
    ("Kyocera", "ECOSYS M2540dn", "mfd", ["TK-1160"]),
    ("Kyocera", "ECOSYS M2635dn", "mfd", ["TK-1170"]),
    ("Kyocera", "ECOSYS M2640idw", "mfd", ["TK-1170"]),
    ("Kyocera", "FS-1020MFP", "mfd", ["TK-1110"]),
    ("Kyocera", "FS-1040", "laser", ["TK-1110"]),
    ("Kyocera", "FS-1060DN", "laser", ["TK-1120"]),
    ("Kyocera", "FS-1120MFP", "mfd", ["TK-1120"]),
    ("Kyocera", "FS-1025MFP", "mfd", ["TK-1110"]),
    ("Kyocera", "FS-1320D", "laser", ["TK-170"]),
    ("Kyocera", "FS-1370DN", "laser", ["TK-170"]),
    ("Kyocera", "ECOSYS P3045dn", "laser", ["TK-3170"]),
    ("Kyocera", "ECOSYS P3050dn", "laser", ["TK-3170"]),
    ("Kyocera", "ECOSYS M3040idn", "mfd", ["TK-3190"]),
    ("Kyocera", "ECOSYS M3540idn", "mfd", ["TK-3130"]),
    ("Kyocera", "TASKalfa 1800", "mfd", ["TK-4109"]),
    ("Kyocera", "TASKalfa 2201", "mfd", ["TK-4109"]),

    # ============================== Samsung ===============================
    ("Samsung", "ML-1660", "laser", ["MLT-D1043S"]),
    ("Samsung", "ML-1666", "laser", ["MLT-D1043S"]),
    ("Samsung", "ML-1860", "laser", ["MLT-D1043S"]),
    ("Samsung", "ML-1865", "laser", ["MLT-D1043S"]),
    ("Samsung", "ML-2161", "laser", ["MLT-D101S"]),
    ("Samsung", "ML-2165", "laser", ["MLT-D101S"]),
    ("Samsung", "SCX-3201", "mfd", ["MLT-D101S"]),
    ("Samsung", "SCX-3401", "mfd", ["MLT-D101S"]),
    ("Samsung", "SCX-3405", "mfd", ["MLT-D101S"]),
    ("Samsung", "SCX-3406W", "mfd", ["MLT-D101S"]),
    ("Samsung", "SL-M2021", "laser", ["MLT-D111S"]),
    ("Samsung", "SL-M2021W", "laser", ["MLT-D111S"]),
    ("Samsung", "SL-M2071", "mfd", ["MLT-D111S"]),
    ("Samsung", "SL-M2071W", "mfd", ["MLT-D111S"]),
    ("Samsung", "SL-M2020", "laser", ["MLT-D111S"]),
    ("Samsung", "SL-M2070", "mfd", ["MLT-D111S"]),
    ("Samsung", "SL-M2026", "laser", ["MLT-D111S"]),
    ("Samsung", "SL-M2876", "mfd", ["MLT-D116L"]),
    ("Samsung", "SL-M2626", "laser", ["MLT-D116L"]),
    ("Samsung", "SL-M2826ND", "laser", ["MLT-D116L"]),
    ("Samsung", "ML-2240", "laser", ["MLT-D108S"]),
    ("Samsung", "ML-1640", "laser", ["MLT-D108S"]),
    ("Samsung", "SCX-4521", "mfd", ["SCX-4521D3"]),
    ("Samsung", "SCX-4623F", "mfd", ["MLT-D105L"]),
    ("Samsung", "ML-2851ND", "laser", ["MLT-D2092L"]),
    ("Samsung", "CLP-365W", "laser", ["CLT-K406S", "CLT-C406S", "CLT-M406S", "CLT-Y406S"]),
    ("Samsung", "CLX-3305", "mfd", ["CLT-K406S", "CLT-C406S", "CLT-M406S", "CLT-Y406S"]),

    # ============================== Konica Minolta ========================
    ("Konica Minolta", "bizhub 164", "mfd", ["TN-116"]),
    ("Konica Minolta", "bizhub 165", "mfd", ["TN-116"]),
    ("Konica Minolta", "bizhub 195", "mfd", ["TN-117"]),
    ("Konica Minolta", "bizhub 215", "mfd", ["TN-118"]),
    ("Konica Minolta", "bizhub 226", "mfd", ["TN-118"]),
    ("Konica Minolta", "bizhub 246", "mfd", ["TN-118"]),
    ("Konica Minolta", "bizhub 7718", "mfd", ["TN-116"]),
    ("Konica Minolta", "bizhub 184", "mfd", ["TN-116"]),
    ("Konica Minolta", "bizhub 185", "mfd", ["TN-116"]),
    ("Konica Minolta", "bizhub 20", "mfd", ["TN-2110"]),
    ("Konica Minolta", "bizhub 25e", "mfd", ["TNP-24"]),
    ("Konica Minolta", "PagePro 1500W", "laser", ["1710567002"]),
    ("Konica Minolta", "bizhub C227", "mfd", ["TN-221K", "TN-221C", "TN-221M", "TN-221Y"]),
    ("Konica Minolta", "bizhub C287", "mfd", ["TN-321K", "TN-321C", "TN-321M", "TN-321Y"]),

    # ============================== Pantum =================================
    ("Pantum", "P2200", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "P2207", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "P2500", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "P2500W", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "P2502W", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6500", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6502", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6502W", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6550NW", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6600NW", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "P3010DW", "laser", ["TL-410", "DL-410"]),
    ("Pantum", "P3300DW", "laser", ["TL-410", "DL-410"]),
    ("Pantum", "M6700DW", "mfd", ["TL-410", "DL-410"]),
    ("Pantum", "M6800FDW", "mfd", ["TL-410", "DL-410"]),
    ("Pantum", "M7100DW", "mfd", ["TL-410", "DL-410"]),
    ("Pantum", "M7200FDW", "mfd", ["TL-410", "DL-410"]),
    ("Pantum", "BM5100ADW", "mfd", ["TL-425", "DL-425"]),
    ("Pantum", "BP5100DW", "laser", ["TL-425", "DL-425"]),
    ("Pantum", "P2210", "laser", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6559NW", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "M6609NW", "mfd", ["PA-210", "PB-211", "PC-210"]),
    ("Pantum", "BM5100FDW", "mfd", ["TL-425", "DL-425"]),
    ("Pantum", "BP5100DN", "laser", ["TL-425", "DL-425"]),
    ("Pantum", "CP2200DW", "laser", ["CTL-1100K", "CTL-1100C", "CTL-1100M", "CTL-1100Y"]),

    # ============================== HP — extended ==========================
    ("HP", "LaserJet Pro M126nw", "mfd", ["CE278A"]),
    ("HP", "LaserJet Pro M128fn", "mfd", ["CE278A"]),
    ("HP", "LaserJet Pro M128fw", "mfd", ["CE278A"]),
    ("HP", "LaserJet Pro 400 M401d", "laser", ["CF280A"]),
    ("HP", "LaserJet Pro 500 MFP M570dn", "mfd", ["CE400A", "CE401A", "CE402A", "CE403A"]),
    ("HP", "LaserJet Enterprise M605", "laser", ["CF281A", "CF281X"]),
    ("HP", "LaserJet Enterprise M607", "laser", ["CF237A", "CF237X"]),
    ("HP", "LaserJet Enterprise M608", "laser", ["CF237A", "CF237X"]),
    ("HP", "LaserJet Enterprise M609", "laser", ["CF237A", "CF237X"]),
    ("HP", "LaserJet Managed E50045", "laser", ["W1335A"]),
    ("HP", "LaserJet Pro 4003dn", "laser", ["W1490A"]),
    # HP LaserJet Pro 4000/4100/4200 series (2022-2026) — W1490A / W1490X
    # (high-yield X) toner cartridges, often paired with W1490AD dual-pack
    # SKU in India. Drum replacement: W1490A is "all-in-one" (toner+drum).
    ("HP", "LaserJet Pro 4001n", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4001dn", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4001dw", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4002dn", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4002dw", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4003dw", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4004dn", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro 4004dw", "laser", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4101fdn", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4101fdw", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4102dw", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4102fdn", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4102fdw", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4103fdn", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4103fdw", "mfd", ["W1490A"]),
    ("HP", "LaserJet Pro MFP 4104dw", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4104fdn", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro MFP 4104fdw", "mfd", ["W1490A", "W1490X"]),
    ("HP", "LaserJet Pro M428fdn", "mfd", ["CF259A"]),
    ("HP", "Color LaserJet Pro M453dn", "laser", ["W2030A", "W2031A", "W2032A", "W2033A"]),
    ("HP", "Color LaserJet Pro MFP M479fdw", "mfd", ["W2030A", "W2031A", "W2032A", "W2033A"]),
    ("HP", "Color LaserJet Pro MFP 4303fdw", "mfd", ["W2210A", "W2211A", "W2212A", "W2213A"]),
    ("HP", "Color LaserJet Enterprise M555dn", "laser", ["W2000A", "W2001A", "W2002A", "W2003A"]),
    ("HP", "Color LaserJet Enterprise M653dn", "laser", ["CF450A", "CF451A", "CF452A", "CF453A"]),
    ("HP", "OfficeJet Pro 9010", "inkjet", ["3HZ52AA"]),
    ("HP", "OfficeJet Pro 9020", "inkjet", ["3HZ52AA"]),
    ("HP", "Smart Tank 540", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 670", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 790", "inkjet", ["GT53", "GT52"]),
    ("HP", "Smart Tank 7301", "inkjet", ["GT53", "GT52"]),
    ("HP", "DeskJet 4178", "inkjet", ["1WD18AA", "1WD17AA"]),
    ("HP", "DeskJet Plus 4123", "inkjet", ["1WD18AA", "1WD17AA"]),
    ("HP", "Laser 108a", "laser", ["W1106A"]),
    ("HP", "Laser 108w", "laser", ["W1106A"]),
    ("HP", "Laser MFP 136w", "mfd", ["W1106A"]),
    ("HP", "Laser MFP 138fnw", "mfd", ["W1106A"]),

    # ============================== Canon — extended =======================
    ("Canon", "imageCLASS LBP6310dn", "laser", ["319 II"]),
    ("Canon", "imageRUNNER 2002", "mfd", ["NPG-28"]),
    ("Canon", "imageRUNNER 2004", "mfd", ["NPG-28"]),
    ("Canon", "imageRUNNER 2206N", "mfd", ["NPG-59"]),
    ("Canon", "imageRUNNER 2425", "mfd", ["C-EXV60"]),
    ("Canon", "imageRUNNER 2520", "mfd", ["C-EXV33"]),
    ("Canon", "imageRUNNER 2525", "mfd", ["C-EXV33"]),
    ("Canon", "imageRUNNER ADVANCE 4025", "mfd", ["C-EXV38"]),
    ("Canon", "imageCLASS MF273dw", "mfd", ["057"]),
    # Canon imageCLASS MF260/MF450/MF650/MF750 series (2022-2026)
    ("Canon", "imageCLASS MF263dn", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF264dw", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF267dw", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF269dw", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF269dw II", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF272dw II", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS MF275dw II", "mfd", ["057", "057H"]),
    ("Canon", "imageCLASS LBP243dw", "laser", ["057", "057H"]),
    ("Canon", "imageCLASS LBP246dw", "laser", ["057", "057H"]),
    # Canon imageCLASS MF400 series — toner 070 / 070H (mono LaserJet replacement
    # for ageing MF260 line, India launch late-2023)
    ("Canon", "imageCLASS MF453dw", "mfd", ["070", "070H"]),
    ("Canon", "imageCLASS MF455dw", "mfd", ["070"]),
    ("Canon", "imageCLASS MF463dw", "mfd", ["070", "070H"]),
    ("Canon", "imageCLASS MF465dw", "mfd", ["070", "070H"]),
    ("Canon", "imageCLASS LBP243Cdw", "laser", ["070", "070H"]),
    ("Canon", "imageCLASS LBP246Cdw", "laser", ["070", "070H"]),
    # Canon imageCLASS MF600 colour series — toner 067 / 067H
    ("Canon", "imageCLASS MF651Cw", "mfd", ["067", "067H"]),
    ("Canon", "imageCLASS MF653Cdw", "mfd", ["067", "067H"]),
    ("Canon", "imageCLASS MF655Cdw", "mfd", ["067", "067H"]),
    ("Canon", "imageCLASS MF657Cdw", "mfd", ["067", "067H"]),
    ("Canon", "imageCLASS LBP633Cdw", "laser", ["067", "067H"]),
    # Canon imageCLASS MF750 colour series — toner 069 / 069H
    ("Canon", "imageCLASS MF752Cdw", "mfd", ["069", "069H"]),
    ("Canon", "imageCLASS MF754Cdw", "mfd", ["069", "069H"]),
    ("Canon", "imageCLASS LBP674Cdw", "laser", ["069", "069H"]),
    ("Canon", "imageCLASS LBP664Cx", "laser", ["055"]),
    ("Canon", "imageCLASS MF643Cdw", "mfd", ["055"]),
    ("Canon", "imageCLASS MF746Cx", "mfd", ["069"]),
    ("Canon", "PIXMA G2730", "inkjet", ["GI-71"]),
    ("Canon", "PIXMA G3730", "inkjet", ["GI-71"]),
    ("Canon", "PIXMA TS3470", "inkjet", ["PG-47", "CL-57"]),
    ("Canon", "PIXMA E4570", "inkjet", ["PG-47", "CL-57"]),
    ("Canon", "PIXMA TR4570S", "inkjet", ["PG-745", "CL-746"]),
    ("Canon", "MAXIFY GX6070", "inkjet", ["GI-76"]),

    # ============================== Epson — extended =======================
    ("Epson", "EcoTank L3260", "inkjet", ["003"]),
    ("Epson", "EcoTank L3550", "inkjet", ["003"]),
    ("Epson", "EcoTank L3556", "inkjet", ["003"]),
    ("Epson", "EcoTank L5590", "inkjet", ["003"]),
    ("Epson", "EcoTank L6580", "inkjet", ["008"]),
    ("Epson", "EcoTank L11160", "inkjet", ["003"]),
    ("Epson", "EcoTank L15160", "inkjet", ["008"]),
    ("Epson", "EcoTank L18050", "inkjet", ["113"]),
    ("Epson", "EcoTank L8050", "inkjet", ["115"]),
    ("Epson", "EcoTank L8058", "inkjet", ["115"]),
    ("Epson", "EcoTank M1100", "inkjet", ["774"]),
    ("Epson", "EcoTank M1120", "inkjet", ["774"]),
    ("Epson", "EcoTank M2140", "inkjet", ["774"]),
    ("Epson", "EcoTank M3170", "inkjet", ["774"]),
    ("Epson", "WorkForce WF-2830", "inkjet", ["298", "299"]),
    ("Epson", "WorkForce Pro WF-3825", "inkjet", ["702"]),
    ("Epson", "WorkForce Pro WF-C5790", "inkjet", ["T9651"]),
    ("Epson", "Stylus Photo L1455", "inkjet", ["T6641", "T6642", "T6643", "T6644"]),
    ("Epson", "SureColor SC-P700", "inkjet", ["T46S"]),
    ("Epson", "LQ-1310", "dotmatrix", ["S015639"]),
    ("Epson", "DLQ-3500", "dotmatrix", ["S015066"]),
    ("Epson", "PLQ-20", "dotmatrix", ["S015339"]),

    # ============================== Brother — extended =====================
    ("Brother", "HL-B2000D", "laser", ["TN-B021", "DR-B021"]),
    ("Brother", "DCP-B7500D", "mfd", ["TN-B021", "DR-B021"]),
    ("Brother", "DCP-B7535DW", "mfd", ["TN-B021", "DR-B021"]),
    ("Brother", "MFC-B7715DW", "mfd", ["TN-B021", "DR-B021"]),
    ("Brother", "HL-1210W", "laser", ["TN-1020", "DR-1020"]),
    ("Brother", "HL-L2376DW", "laser", ["TN-2480", "DR-2480"]),
    ("Brother", "MFC-L2716DW", "mfd", ["TN-2480", "DR-2480"]),
    ("Brother", "HL-L5100DN", "laser", ["TN-3448", "DR-3455"]),
    ("Brother", "HL-L6400DW", "laser", ["TN-3498", "DR-3455"]),
    ("Brother", "MFC-L5900DW", "mfd", ["TN-3448", "DR-3455"]),
    ("Brother", "HL-L8360CDW", "laser", ["TN-451BK", "TN-451C", "TN-451M", "TN-451Y"]),
    ("Brother", "MFC-L8900CDW", "mfd", ["TN-451BK", "TN-451C", "TN-451M", "TN-451Y"]),
    ("Brother", "DCP-T426W", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "DCP-T425W", "inkjet", ["BT-D60BK", "BT-5000C", "BT-5000M", "BT-5000Y"]),
    ("Brother", "MFC-J3530DW", "inkjet", ["LC-3617BK", "LC-3617C", "LC-3617M", "LC-3617Y"]),
    ("Brother", "MFC-J2330DW", "inkjet", ["LC-3619XLBK"]),

    # ============================== Kyocera — extended =====================
    ("Kyocera", "ECOSYS PA2000", "laser", ["TK-1248"]),
    ("Kyocera", "ECOSYS MA2000w", "mfd", ["TK-1248"]),
    ("Kyocera", "ECOSYS P2335d", "laser", ["TK-1175"]),
    ("Kyocera", "ECOSYS M2735dw", "mfd", ["TK-1175"]),
    ("Kyocera", "ECOSYS P5021cdn", "laser", ["TK-5220K", "TK-5220C", "TK-5220M", "TK-5220Y"]),
    ("Kyocera", "ECOSYS M5521cdw", "mfd", ["TK-5230K", "TK-5230C", "TK-5230M", "TK-5230Y"]),
    ("Kyocera", "ECOSYS P6230cdn", "laser", ["TK-5290K", "TK-5290C", "TK-5290M", "TK-5290Y"]),
    ("Kyocera", "ECOSYS P4040dn", "laser", ["TK-7300"]),
    ("Kyocera", "ECOSYS M4125idn", "mfd", ["TK-6115"]),
    ("Kyocera", "TASKalfa 2552ci", "mfd", ["TK-8345K", "TK-8345C", "TK-8345M", "TK-8345Y"]),
    ("Kyocera", "TASKalfa 3011i", "mfd", ["TK-6115"]),
    ("Kyocera", "TASKalfa 4012i", "mfd", ["TK-6325"]),
    ("Kyocera", "FS-4100DN", "laser", ["TK-3100"]),
    ("Kyocera", "FS-6525MFP", "mfd", ["TK-475"]),

    # ============================== Ricoh — extended =======================
    ("Ricoh", "SP 320DN", "laser", ["SP 320"]),
    ("Ricoh", "SP 330DN", "laser", ["SP 330"]),
    ("Ricoh", "SP C261DNw", "laser", ["SP C261"]),
    ("Ricoh", "SP C261SFNw", "mfd", ["SP C261"]),
    ("Ricoh", "SP C360DNw", "laser", ["SP C360"]),
    ("Ricoh", "MP 2501L", "mfd", ["MP 2501"]),
    ("Ricoh", "MP 2014AD", "mfd", ["MP 2014"]),
    ("Ricoh", "IM 2500", "mfd", ["IM 2500"]),
    ("Ricoh", "IM C2000", "mfd", ["IM C2000"]),
    ("Ricoh", "SP 277SNwX", "mfd", ["SP 277"]),

    # ============================== Xerox — extended =======================
    ("Xerox", "VersaLink B400", "laser", ["106R03581"]),
    ("Xerox", "VersaLink B405", "mfd", ["106R03581"]),
    ("Xerox", "VersaLink C400", "laser", ["106R03511", "106R03512", "106R03513", "106R03514"]),
    ("Xerox", "VersaLink C405", "mfd", ["106R03511", "106R03512", "106R03513", "106R03514"]),
    ("Xerox", "Phaser 6510", "laser", ["106R03480", "106R03477", "106R03478", "106R03479"]),
    ("Xerox", "WorkCentre 6515", "mfd", ["106R03480", "106R03477", "106R03478", "106R03479"]),
    ("Xerox", "B225", "mfd", ["006R04400"]),
    ("Xerox", "B230", "laser", ["006R04400"]),
    ("Xerox", "B235", "mfd", ["006R04400"]),
    ("Xerox", "B305", "mfd", ["006R04403"]),
    ("Xerox", "B310", "laser", ["006R04403"]),
    ("Xerox", "B315", "mfd", ["006R04403"]),
    ("Xerox", "WorkCentre 3335", "mfd", ["106R03623"]),

    # ============================== Samsung — extended =====================
    ("Samsung", "Xpress SL-M2835DW", "laser", ["MLT-D116L"]),
    ("Samsung", "Xpress SL-M2885FW", "mfd", ["MLT-D116L"]),
    ("Samsung", "Xpress SL-M3320ND", "laser", ["MLT-D203L"]),
    ("Samsung", "Xpress SL-M3820DW", "laser", ["MLT-D203L"]),
    ("Samsung", "Xpress SL-M4020ND", "laser", ["MLT-D203E"]),
    ("Samsung", "ProXpress SL-M4070FR", "mfd", ["MLT-D203U"]),
    ("Samsung", "Xpress SL-C480W", "laser", ["CLT-K404S", "CLT-C404S", "CLT-M404S", "CLT-Y404S"]),
    ("Samsung", "Xpress SL-C480FW", "mfd", ["CLT-K404S", "CLT-C404S", "CLT-M404S", "CLT-Y404S"]),
    ("Samsung", "SCX-4824FN", "mfd", ["MLT-D209L"]),
    ("Samsung", "ML-3471ND", "laser", ["ML-D3470B"]),

    # ============================== Konica Minolta — extended ==============
    ("Konica Minolta", "bizhub 225i", "mfd", ["TN-302K"]),
    ("Konica Minolta", "bizhub 300i", "mfd", ["TN-322"]),
    ("Konica Minolta", "bizhub 367", "mfd", ["TN-323"]),
    ("Konica Minolta", "bizhub 458", "mfd", ["TN-512K"]),
    ("Konica Minolta", "bizhub C258", "mfd", ["TN-324K", "TN-324C", "TN-324M", "TN-324Y"]),
    ("Konica Minolta", "bizhub C308", "mfd", ["TN-324K", "TN-324C", "TN-324M", "TN-324Y"]),
    ("Konica Minolta", "bizhub C360i", "mfd", ["TN-328K", "TN-328C", "TN-328M", "TN-328Y"]),
    ("Konica Minolta", "bizhub 4000i", "laser", ["TNP-34", "TNP-37"]),

    # ============================== Sharp ==================================
    ("Sharp", "AR-6020", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-6020N", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-6020D", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-6023", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-5618", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-5620", "mfd", ["AR-021ST"]),
    ("Sharp", "AR-7024", "mfd", ["AR-021ST"]),
    ("Sharp", "MX-M266", "mfd", ["MX-237AT"]),
    ("Sharp", "MX-M266N", "mfd", ["MX-237AT"]),
    ("Sharp", "MX-M316", "mfd", ["MX-312AT"]),
    ("Sharp", "MX-M356N", "mfd", ["MX-312AT"]),
    ("Sharp", "MX-3070N", "mfd", ["MX-31AT-BA", "MX-31AT-CA", "MX-31AT-MA", "MX-31AT-YA"]),
    ("Sharp", "MX-4071", "mfd", ["MX-31AT-BA", "MX-31AT-CA", "MX-31AT-MA", "MX-31AT-YA"]),
    ("Sharp", "MX-2651", "mfd", ["MX-61GT-BA", "MX-61GT-CA", "MX-61GT-MA", "MX-61GT-YA"]),
    ("Sharp", "MX-B355W", "mfd", ["MX-B35GT"]),
    ("Sharp", "MX-B455W", "mfd", ["MX-B45GT"]),

    # ============================== Riso ===================================
    ("Riso", "ComColor FW5230", "inkjet", ["S-6701"]),
    ("Riso", "ComColor FW5231", "inkjet", ["S-6701"]),
    ("Riso", "ComColor FW1230", "inkjet", ["S-6702"]),
    ("Riso", "ComColor GD7330", "inkjet", ["S-6300"]),
    ("Riso", "RZ 1070", "duplicator", ["S-4250"]),
    ("Riso", "CV 3230", "duplicator", ["S-2489"]),
    ("Riso", "SF 5130", "duplicator", ["S-7613"]),
    ("Riso", "EZ 221", "duplicator", ["S-4253"]),
]

# Cartridge metadata — brand + type[toner|ink|drum]. Used to enrich the derived
# toner catalogue. Anything referenced by a printer but missing here defaults to
# the printer's brand and type "toner".
TONER_META = {
    # HP mono toners
    "Q2612A": ("HP", "toner"), "Q5949A": ("HP", "toner"), "Q5949X": ("HP", "toner"),
    "Q2610A": ("HP", "toner"), "Q6511A": ("HP", "toner"), "Q6511X": ("HP", "toner"),
    "Q7551A": ("HP", "toner"), "Q7551X": ("HP", "toner"), "Q5942A": ("HP", "toner"),
    "Q5942X": ("HP", "toner"), "Q7516A": ("HP", "toner"),
    "CB435A": ("HP", "toner"), "CB436A": ("HP", "toner"), "CE285A": ("HP", "toner"),
    "CE505A": ("HP", "toner"), "CE505X": ("HP", "toner"), "CE255A": ("HP", "toner"),
    "CE255X": ("HP", "toner"), "CF280A": ("HP", "toner"), "CF280X": ("HP", "toner"),
    "CF283A": ("HP", "toner"), "CF226A": ("HP", "toner"), "CF279A": ("HP", "toner"),
    "CF248A": ("HP", "toner"), "CF217A": ("HP", "toner"), "CF230A": ("HP", "toner"),
    "CF230X": ("HP", "toner"), "CF259A": ("HP", "toner"), "CF259X": ("HP", "toner"),
    "CF289A": ("HP", "toner"), "CF289X": ("HP", "toner"), "CF294A": ("HP", "toner"),
    "CF325X": ("HP", "toner"), "W1103A": ("HP", "toner"),
    # HP colour toners
    "CF500A": ("HP", "toner"), "CF501A": ("HP", "toner"), "CF502A": ("HP", "toner"), "CF503A": ("HP", "toner"),
    "W2110A": ("HP", "toner"), "W2111A": ("HP", "toner"), "W2112A": ("HP", "toner"), "W2113A": ("HP", "toner"),
    "CF400A": ("HP", "toner"), "CF401A": ("HP", "toner"), "CF402A": ("HP", "toner"), "CF403A": ("HP", "toner"),
    "CE310A": ("HP", "toner"), "CE311A": ("HP", "toner"), "CE312A": ("HP", "toner"), "CE313A": ("HP", "toner"),
    "CF210A": ("HP", "toner"), "CF211A": ("HP", "toner"), "CF212A": ("HP", "toner"), "CF213A": ("HP", "toner"),
    "CC530A": ("HP", "toner"), "CC531A": ("HP", "toner"), "CC532A": ("HP", "toner"), "CC533A": ("HP", "toner"),
    "CF410A": ("HP", "toner"), "CF411A": ("HP", "toner"), "CF412A": ("HP", "toner"), "CF413A": ("HP", "toner"),
    "CB540A": ("HP", "toner"), "CB541A": ("HP", "toner"), "CB542A": ("HP", "toner"), "CB543A": ("HP", "toner"),
    # HP inks
    "F6V28AA": ("HP", "ink"), "F6V26AA": ("HP", "ink"), "1WD18AA": ("HP", "ink"), "1WD17AA": ("HP", "ink"),
    "F6U16AA": ("HP", "ink"), "F6U17AA": ("HP", "ink"), "F6U18AA": ("HP", "ink"), "F6U19AA": ("HP", "ink"),
    "T6L99AA": ("HP", "ink"), "T6L91AA": ("HP", "ink"), "T6L95AA": ("HP", "ink"), "T6L93AA": ("HP", "ink"),
    "GT51": ("HP", "ink"), "GT52": ("HP", "ink"), "GT53": ("HP", "ink"),
    # Canon toners
    "303": ("Canon", "toner"), "FX-9": ("Canon", "toner"), "FX-10": ("Canon", "toner"),
    "325": ("Canon", "toner"), "326": ("Canon", "toner"), "328": ("Canon", "toner"),
    "337": ("Canon", "toner"), "319": ("Canon", "toner"), "057": ("Canon", "toner"),
    "046": ("Canon", "toner"), "329": ("Canon", "toner"), "318": ("Canon", "toner"),
    # Canon inks
    "PG-745": ("Canon", "ink"), "CL-746": ("Canon", "ink"), "PG-810": ("Canon", "ink"), "CL-811": ("Canon", "ink"),
    "GI-790": ("Canon", "ink"), "GI-71": ("Canon", "ink"), "GI-73": ("Canon", "ink"),
    # Brother toners + drums
    "TN-1020": ("Brother", "toner"), "TN-2130": ("Brother", "toner"), "TN-2260": ("Brother", "toner"),
    "TN-2305": ("Brother", "toner"), "TN-2355": ("Brother", "toner"), "TN-2480": ("Brother", "toner"),
    "TN-3320": ("Brother", "toner"), "TN-3380": ("Brother", "toner"),
    "TN-263BK": ("Brother", "toner"), "TN-263C": ("Brother", "toner"), "TN-263M": ("Brother", "toner"), "TN-263Y": ("Brother", "toner"),
    "TN-267BK": ("Brother", "toner"), "TN-267C": ("Brother", "toner"), "TN-267M": ("Brother", "toner"), "TN-267Y": ("Brother", "toner"),
    "DR-1020": ("Brother", "drum"), "DR-2125": ("Brother", "drum"), "DR-2225": ("Brother", "drum"),
    "DR-2305": ("Brother", "drum"), "DR-2355": ("Brother", "drum"), "DR-2480": ("Brother", "drum"), "DR-3215": ("Brother", "drum"),
    # Brother ink
    "BT-D60BK": ("Brother", "ink"), "BT-5000C": ("Brother", "ink"), "BT-5000M": ("Brother", "ink"), "BT-5000Y": ("Brother", "ink"),
    "BTD60BK": ("Brother", "ink"), "BT5000C": ("Brother", "ink"), "BT5000M": ("Brother", "ink"), "BT5000Y": ("Brother", "ink"),
    # Epson inks
    "003": ("Epson", "ink"), "664": ("Epson", "ink"), "008": ("Epson", "ink"),
    "774": ("Epson", "ink"), "673": ("Epson", "ink"),
    "S015641": ("Epson", "ribbon"), "S015639": ("Epson", "ribbon"), "S015336": ("Epson", "ribbon"), "S015329": ("Epson", "ribbon"),
    # Ricoh toners
    "SP 111": ("Ricoh", "toner"), "SP 200": ("Ricoh", "toner"), "SP 210": ("Ricoh", "toner"),
    "SP 212": ("Ricoh", "toner"), "SP 220": ("Ricoh", "toner"), "SP 230": ("Ricoh", "toner"),
    "SP 310": ("Ricoh", "toner"), "SP 311": ("Ricoh", "toner"), "SP 325": ("Ricoh", "toner"),
    "SP 3500": ("Ricoh", "toner"), "SP 3600": ("Ricoh", "toner"), "SP 4500": ("Ricoh", "toner"),
    "SP 100": ("Ricoh", "toner"), "MP 2014": ("Ricoh", "toner"), "MP 301": ("Ricoh", "toner"),
    # Xerox toners
    "106R02773": ("Xerox", "toner"), "106R02778": ("Xerox", "toner"), "106R02182": ("Xerox", "toner"),
    "106R04347": ("Xerox", "toner"), "106R01379": ("Xerox", "toner"), "106R01159": ("Xerox", "toner"),
    "013R00625": ("Xerox", "drum"),
    # Kyocera toners
    "TK-1110": ("Kyocera", "toner"), "TK-1120": ("Kyocera", "toner"), "TK-1150": ("Kyocera", "toner"),
    "TK-1160": ("Kyocera", "toner"), "TK-1170": ("Kyocera", "toner"), "TK-170": ("Kyocera", "toner"),
    "TK-3160": ("Kyocera", "toner"), "TK-3170": ("Kyocera", "toner"), "TK-3190": ("Kyocera", "toner"),
    "TK-3130": ("Kyocera", "toner"), "TK-4109": ("Kyocera", "toner"),
    # Samsung toners
    "MLT-D101S": ("Samsung", "toner"), "MLT-D111S": ("Samsung", "toner"), "MLT-D116L": ("Samsung", "toner"),
    "MLT-D103S": ("Samsung", "toner"), "MLT-D104S": ("Samsung", "toner"), "MLT-D105L": ("Samsung", "toner"),
    "MLT-D108S": ("Samsung", "toner"), "MLT-D1043S": ("Samsung", "toner"), "MLT-D2092L": ("Samsung", "toner"),
    "SCX-4521D3": ("Samsung", "toner"),
    "CLT-K406S": ("Samsung", "toner"), "CLT-C406S": ("Samsung", "toner"), "CLT-M406S": ("Samsung", "toner"), "CLT-Y406S": ("Samsung", "toner"),
    # Konica Minolta
    "TN-116": ("Konica Minolta", "toner"), "TN-117": ("Konica Minolta", "toner"), "TN-118": ("Konica Minolta", "toner"),
    "TN-2110": ("Konica Minolta", "toner"), "TNP-24": ("Konica Minolta", "toner"), "1710567002": ("Konica Minolta", "toner"),
    "TN-221K": ("Konica Minolta", "toner"), "TN-221C": ("Konica Minolta", "toner"), "TN-221M": ("Konica Minolta", "toner"), "TN-221Y": ("Konica Minolta", "toner"),
    "TN-321K": ("Konica Minolta", "toner"), "TN-321C": ("Konica Minolta", "toner"), "TN-321M": ("Konica Minolta", "toner"), "TN-321Y": ("Konica Minolta", "toner"),
    # Pantum
    "PA-210": ("Pantum", "toner"), "PB-211": ("Pantum", "toner"), "PC-210": ("Pantum", "drum"),
    "TL-410": ("Pantum", "toner"), "DL-410": ("Pantum", "drum"), "TL-425": ("Pantum", "toner"), "DL-425": ("Pantum", "drum"),
    "CTL-1100K": ("Pantum", "toner"), "CTL-1100C": ("Pantum", "toner"), "CTL-1100M": ("Pantum", "toner"), "CTL-1100Y": ("Pantum", "toner"),
    # HP extended
    "CE278A": ("HP", "toner"), "CF281A": ("HP", "toner"), "CF281X": ("HP", "toner"),
    "CF237A": ("HP", "toner"), "CF237X": ("HP", "toner"), "W1335A": ("HP", "toner"), "W1490A": ("HP", "toner"), "W1106A": ("HP", "toner"),
    "CE400A": ("HP", "toner"), "CE401A": ("HP", "toner"), "CE402A": ("HP", "toner"), "CE403A": ("HP", "toner"),
    "W2030A": ("HP", "toner"), "W2031A": ("HP", "toner"), "W2032A": ("HP", "toner"), "W2033A": ("HP", "toner"),
    "W2210A": ("HP", "toner"), "W2211A": ("HP", "toner"), "W2212A": ("HP", "toner"), "W2213A": ("HP", "toner"),
    "W2000A": ("HP", "toner"), "W2001A": ("HP", "toner"), "W2002A": ("HP", "toner"), "W2003A": ("HP", "toner"),
    "CF450A": ("HP", "toner"), "CF451A": ("HP", "toner"), "CF452A": ("HP", "toner"), "CF453A": ("HP", "toner"),
    "3HZ52AA": ("HP", "ink"),
    # Canon extended
    "319 II": ("Canon", "toner"), "NPG-28": ("Canon", "toner"), "NPG-59": ("Canon", "toner"),
    "C-EXV60": ("Canon", "toner"), "C-EXV33": ("Canon", "toner"), "C-EXV38": ("Canon", "toner"),
    "055": ("Canon", "toner"), "069": ("Canon", "toner"), "070": ("Canon", "toner"), "GI-76": ("Canon", "ink"),
    # Epson extended
    "113": ("Epson", "ink"), "115": ("Epson", "ink"), "298": ("Epson", "ink"), "299": ("Epson", "ink"),
    "702": ("Epson", "ink"), "T9651": ("Epson", "ink"), "T46S": ("Epson", "ink"),
    "S015066": ("Epson", "ribbon"), "S015339": ("Epson", "ribbon"),
    # Brother extended
    "TN-B021": ("Brother", "toner"), "DR-B021": ("Brother", "drum"),
    "TN-3448": ("Brother", "toner"), "TN-3498": ("Brother", "toner"), "DR-3455": ("Brother", "drum"),
    "TN-451BK": ("Brother", "toner"), "TN-451C": ("Brother", "toner"), "TN-451M": ("Brother", "toner"), "TN-451Y": ("Brother", "toner"),
    "LC-3617BK": ("Brother", "ink"), "LC-3617C": ("Brother", "ink"), "LC-3617M": ("Brother", "ink"), "LC-3617Y": ("Brother", "ink"),
    # Kyocera extended
    "TK-1248": ("Kyocera", "toner"), "TK-1175": ("Kyocera", "toner"), "TK-7300": ("Kyocera", "toner"),
    "TK-6115": ("Kyocera", "toner"), "TK-6325": ("Kyocera", "toner"), "TK-3100": ("Kyocera", "toner"),
    "TK-5220K": ("Kyocera", "toner"), "TK-5220C": ("Kyocera", "toner"), "TK-5220M": ("Kyocera", "toner"), "TK-5220Y": ("Kyocera", "toner"),
    "TK-5230C": ("Kyocera", "toner"), "TK-5230M": ("Kyocera", "toner"), "TK-5230Y": ("Kyocera", "toner"),
    "TK-5290K": ("Kyocera", "toner"), "TK-5290C": ("Kyocera", "toner"), "TK-5290M": ("Kyocera", "toner"), "TK-5290Y": ("Kyocera", "toner"),
    "TK-8345K": ("Kyocera", "toner"), "TK-8345C": ("Kyocera", "toner"), "TK-8345M": ("Kyocera", "toner"), "TK-8345Y": ("Kyocera", "toner"),
    # Ricoh extended
    "SP 320": ("Ricoh", "toner"), "SP 330": ("Ricoh", "toner"), "SP C261": ("Ricoh", "toner"),
    "SP C360": ("Ricoh", "toner"), "MP 2501": ("Ricoh", "toner"), "IM 2500": ("Ricoh", "toner"), "IM C2000": ("Ricoh", "toner"),
    # Xerox extended
    "106R03581": ("Xerox", "toner"), "106R03623": ("Xerox", "toner"), "006R04400": ("Xerox", "toner"),
    "006R04403": ("Xerox", "toner"),
    "106R03511": ("Xerox", "toner"), "106R03512": ("Xerox", "toner"), "106R03513": ("Xerox", "toner"), "106R03514": ("Xerox", "toner"),
    "106R03480": ("Xerox", "toner"), "106R03477": ("Xerox", "toner"), "106R03478": ("Xerox", "toner"), "106R03479": ("Xerox", "toner"),
    # Samsung extended
    "MLT-D203E": ("Samsung", "toner"), "MLT-D203U": ("Samsung", "toner"), "MLT-D209L": ("Samsung", "toner"), "ML-D3470B": ("Samsung", "toner"),
    "CLT-K404S": ("Samsung", "toner"), "CLT-C404S": ("Samsung", "toner"), "CLT-M404S": ("Samsung", "toner"), "CLT-Y404S": ("Samsung", "toner"),
    # Konica Minolta extended
    "TN-302K": ("Konica Minolta", "toner"), "TN-322": ("Konica Minolta", "toner"), "TN-323": ("Konica Minolta", "toner"),
    "TN-324K": ("Konica Minolta", "toner"), "TN-324C": ("Konica Minolta", "toner"), "TN-324M": ("Konica Minolta", "toner"), "TN-324Y": ("Konica Minolta", "toner"),
    "TN-328K": ("Konica Minolta", "toner"), "TN-328C": ("Konica Minolta", "toner"), "TN-328M": ("Konica Minolta", "toner"), "TN-328Y": ("Konica Minolta", "toner"),
    "TNP-34": ("Konica Minolta", "toner"), "TNP-37": ("Konica Minolta", "toner"),
    # Sharp
    "AR-021ST": ("Sharp", "toner"), "MX-237AT": ("Sharp", "toner"), "MX-312AT": ("Sharp", "toner"),
    "MX-31AT-BA": ("Sharp", "toner"), "MX-31AT-CA": ("Sharp", "toner"), "MX-31AT-MA": ("Sharp", "toner"), "MX-31AT-YA": ("Sharp", "toner"),
    "MX-61GT-BA": ("Sharp", "toner"), "MX-61GT-CA": ("Sharp", "toner"), "MX-61GT-MA": ("Sharp", "toner"), "MX-61GT-YA": ("Sharp", "toner"),
    "MX-B35GT": ("Sharp", "toner"), "MX-B45GT": ("Sharp", "toner"),
    # Riso
    "S-6701": ("Riso", "ink"), "S-6702": ("Riso", "ink"), "S-6300": ("Riso", "ink"),
    "S-4250": ("Riso", "ink"), "S-2489": ("Riso", "ink"), "S-7613": ("Riso", "ink"), "S-4253": ("Riso", "ink"),
}

# Standalone cartridges (popular SKUs not necessarily tied to a printer above)
# to broaden the toner dropdown catalogue.
EXTRA_TONERS = [
    ("HP", "CF259A (59A)", "toner"), ("HP", "Q2613A (13A)", "toner"), ("HP", "C7115A (15A)", "toner"),
    ("HP", "CB388A (88A)", "toner"), ("HP", "CC388A (88A)", "toner"), ("HP", "CE278A (78A)", "toner"),
    ("HP", "Q1338A (38A)", "toner"), ("HP", "Q1339A (39A)", "toner"), ("HP", "Q5945A (45A)", "toner"),
    ("HP", "CF237A (37A)", "toner"), ("HP", "CF276A (76A)", "toner"), ("HP", "W1500A (150A)", "toner"),
    ("HP", "GT53XL", "ink"), ("HP", "680 Black", "ink"), ("HP", "680 Tri-color", "ink"),
    ("HP", "678 Black", "ink"), ("HP", "678 Tri-color", "ink"), ("HP", "802 Black", "ink"), ("HP", "802 Tri-color", "ink"),
    ("HP", "803 Black", "ink"), ("HP", "803 Tri-color", "ink"), ("HP", "905 Black", "ink"), ("HP", "955 Black", "ink"),
    ("Canon", "925", "toner"), ("Canon", "912", "toner"), ("Canon", "052", "toner"), ("Canon", "047", "toner"),
    ("Canon", "308", "toner"), ("Canon", "315", "toner"), ("Canon", "715", "toner"), ("Canon", "728", "toner"),
    ("Canon", "737", "toner"), ("Canon", "740", "toner"), ("Canon", "749", "toner"), ("Canon", "E16", "toner"),
    ("Canon", "PG-47", "ink"), ("Canon", "CL-57", "ink"), ("Canon", "PG-88", "ink"), ("Canon", "PG-740", "ink"), ("Canon", "CL-741", "ink"),
    ("Brother", "TN-2010", "toner"), ("Brother", "TN-2060", "toner"), ("Brother", "TN-450", "toner"),
    ("Brother", "TN-3290", "toner"), ("Brother", "LC-3617BK", "ink"), ("Brother", "LC-3619XLBK", "ink"),
    ("Brother", "LC-67BK", "ink"), ("Brother", "LC-565BK", "ink"), ("Brother", "DR-2255", "drum"),
    ("Epson", "001 Black", "ink"), ("Epson", "001 Cyan", "ink"), ("Epson", "001 Magenta", "ink"), ("Epson", "001 Yellow", "ink"),
    ("Epson", "005 Black", "ink"), ("Epson", "057 Black", "ink"), ("Epson", "065 Black", "ink"),
    ("Epson", "T6641", "ink"), ("Epson", "T6642", "ink"), ("Epson", "T6643", "ink"), ("Epson", "T6644", "ink"),
    ("Kyocera", "TK-5230K", "toner"), ("Kyocera", "TK-5240K", "toner"), ("Kyocera", "TK-8335K", "toner"),
    ("Kyocera", "TK-7300", "toner"), ("Kyocera", "TK-6308", "toner"), ("Kyocera", "TK-475", "toner"),
    ("Samsung", "MLT-D203L", "toner"), ("Samsung", "MLT-D205L", "toner"), ("Samsung", "MLT-D305L", "toner"),
    ("Samsung", "MLT-D707S", "toner"), ("Samsung", "MLT-D358S", "toner"),
    ("Ricoh", "SP 277", "toner"), ("Ricoh", "MP 2501", "toner"), ("Ricoh", "MP C2003", "toner"), ("Ricoh", "SP C250", "toner"),
    ("Xerox", "006R01573", "toner"), ("Xerox", "106R03623", "toner"), ("Xerox", "006R01694", "toner"),
    ("Konica Minolta", "TN-217", "toner"), ("Konica Minolta", "TN-414", "toner"), ("Konica Minolta", "TN-512K", "toner"),
    ("Pantum", "PC-211EV", "toner"), ("Pantum", "PA-310", "toner"), ("Pantum", "CTL-1100K", "toner"),
    # ---- Extended standalone catalogue (broadens the searchable dropdown) ----
    ("HP", "CF226X (26X)", "toner"), ("HP", "CF258A (58A)", "toner"), ("HP", "CF258X (58X)", "toner"),
    ("HP", "W1500X (150X)", "toner"), ("HP", "W1335X (335X)", "toner"), ("HP", "W1490X (149X)", "toner"),
    ("HP", "Q7553A (53A)", "toner"), ("HP", "Q7553X (53X)", "toner"), ("HP", "CB387A", "toner"),
    ("HP", "CE390A (90A)", "toner"), ("HP", "CE390X (90X)", "toner"), ("HP", "CF214A (14A)", "toner"),
    ("HP", "CF214X (14X)", "toner"), ("HP", "Q6470A", "toner"), ("HP", "CB400A", "toner"),
    ("HP", "GT51XL", "ink"), ("HP", "44 Black", "ink"), ("HP", "703 Black", "ink"), ("HP", "703 Tri-color", "ink"),
    ("HP", "704 Black", "ink"), ("HP", "704 Tri-color", "ink"), ("HP", "682 Black", "ink"), ("HP", "682 Tri-color", "ink"),
    ("HP", "965 Black", "ink"), ("HP", "975 Black", "ink"), ("HP", "990 Black", "ink"),
    ("Canon", "337 II", "toner"), ("Canon", "045", "toner"), ("Canon", "045H", "toner"),
    ("Canon", "067", "toner"), ("Canon", "071", "toner"), ("Canon", "324", "toner"),
    ("Canon", "331", "toner"), ("Canon", "335", "toner"), ("Canon", "527", "toner"),
    ("Canon", "708", "toner"), ("Canon", "719", "toner"), ("Canon", "C-EXV3", "toner"),
    ("Canon", "C-EXV14", "toner"), ("Canon", "C-EXV18", "toner"), ("Canon", "NPG-51", "toner"),
    ("Canon", "PG-810XL", "ink"), ("Canon", "CL-811XL", "ink"), ("Canon", "GI-790 Black", "ink"),
    ("Canon", "PGI-2700", "ink"), ("Canon", "PG-89", "ink"),
    ("Brother", "TN-2280", "toner"), ("Brother", "TN-2380", "toner"), ("Brother", "TN-2480", "toner"),
    ("Brother", "TN-3460", "toner"), ("Brother", "TN-261BK", "toner"), ("Brother", "TN-265C", "toner"),
    ("Brother", "TN-411BK", "toner"), ("Brother", "DR-3300", "drum"), ("Brother", "DR-261CL", "drum"),
    ("Brother", "LC-3619XLC", "ink"), ("Brother", "LC-461BK", "ink"), ("Brother", "LC-462BK", "ink"),
    ("Epson", "008 Black", "ink"), ("Epson", "008 Cyan", "ink"), ("Epson", "008 Magenta", "ink"), ("Epson", "008 Yellow", "ink"),
    ("Epson", "003 Black", "ink"), ("Epson", "664 Black", "ink"), ("Epson", "L-Ink 101", "ink"),
    ("Epson", "T03Y1", "ink"), ("Epson", "T502", "ink"), ("Epson", "T504", "ink"), ("Epson", "T673", "ink"),
    ("Epson", "S015632", "ribbon"), ("Epson", "S015637", "ribbon"),
    ("Kyocera", "TK-1140", "toner"), ("Kyocera", "TK-1144", "toner"), ("Kyocera", "TK-1178", "toner"),
    ("Kyocera", "TK-5144K", "toner"), ("Kyocera", "TK-5154K", "toner"), ("Kyocera", "TK-5284K", "toner"),
    ("Kyocera", "TK-8115K", "toner"), ("Kyocera", "TK-8515K", "toner"), ("Kyocera", "TK-8525K", "toner"),
    ("Kyocera", "TK-8800", "toner"), ("Kyocera", "TK-4148", "toner"), ("Kyocera", "TK-6118", "toner"),
    ("Samsung", "MLT-D116S", "toner"), ("Samsung", "MLT-D204L", "toner"), ("Samsung", "MLT-D304L", "toner"),
    ("Samsung", "MLT-D704S", "toner"), ("Samsung", "CLT-K504S", "toner"), ("Samsung", "CLT-K506L", "toner"),
    ("Samsung", "CLT-K603L", "toner"), ("Samsung", "MLT-R116", "drum"),
    ("Ricoh", "SP C220", "toner"), ("Ricoh", "SP C252", "toner"), ("Ricoh", "SP C340", "toner"),
    ("Ricoh", "MP C3003", "toner"), ("Ricoh", "MP C3503", "toner"), ("Ricoh", "MP 3554", "toner"),
    ("Ricoh", "IM C3000", "toner"), ("Ricoh", "IM 3500", "toner"), ("Ricoh", "SP 4520", "toner"),
    ("Xerox", "106R02307", "toner"), ("Xerox", "106R02311", "toner"), ("Xerox", "106R03048", "toner"),
    ("Xerox", "106R03396", "toner"), ("Xerox", "106R04348", "toner"), ("Xerox", "013R00591", "drum"),
    ("Xerox", "101R00474", "drum"), ("Xerox", "108R01121", "drum"),
    ("Konica Minolta", "TN-118", "toner"), ("Konica Minolta", "TN-216K", "toner"), ("Konica Minolta", "TN-319K", "toner"),
    ("Konica Minolta", "TN-326", "toner"), ("Konica Minolta", "TN-516K", "toner"), ("Konica Minolta", "TN-619K", "toner"),
    ("Konica Minolta", "TNP-48K", "toner"), ("Konica Minolta", "DR-313K", "drum"),
    ("Sharp", "MX-560AT", "toner"), ("Sharp", "MX-560FT", "toner"), ("Sharp", "MX-451AT", "toner"),
    ("Sharp", "MX-235AT", "toner"), ("Sharp", "AR-020ST", "toner"), ("Sharp", "AR-202ST", "toner"),
    ("Sharp", "MX-51AT-BA", "toner"), ("Sharp", "MX-23AT-BA", "toner"),
    ("Pantum", "TL-5120", "toner"), ("Pantum", "TL-5120H", "toner"), ("Pantum", "DL-5120", "drum"),
    ("Pantum", "TO-410", "toner"), ("Pantum", "CTL-1100HK", "toner"),
    ("Riso", "S-6702E Black", "ink"), ("Riso", "S-6703E Cyan", "ink"), ("Riso", "S-6704E Magenta", "ink"),
    ("Riso", "S-6705E Yellow", "ink"), ("Riso", "S-4393 Master", "drum"), ("Riso", "S-8113 Master", "drum"),
    ("Lexmark", "50F1H00", "toner"), ("Lexmark", "60F1H00", "toner"), ("Lexmark", "B221H00", "toner"),
    ("Lexmark", "58D1H00", "toner"), ("Lexmark", "C540H1KG", "toner"),
    ("OKI", "44574902", "toner"), ("OKI", "45807112", "toner"), ("OKI", "46508712", "toner"),
]


import re
from difflib import get_close_matches
from functools import lru_cache

# Marketing / sub-brand words commonly omitted from SEO slugs. They never
# distinguish two distinct models, so stripping them yields clean canonical
# slugs (e.g. "Canon imageCLASS LBP2900" -> canon-lbp2900) while the tolerant
# resolver below still accepts the full forms.
_FILLER_TOKENS = {"imageclass", "ecotank", "mfp", "series"}


def _raw_slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def _infer_toner_type(brand: str, model: str) -> str:
    """Best-effort cartridge type for models not in TONER_META, by code pattern,
    so inks/drums don't get mislabelled as toner (e.g. Brother LC-* are inks)."""
    m = (model or "").upper().strip()
    if "DRUM" in m or re.match(r"^(DR|DK)\b|^(DR|DK)-?\d|^EP-?87|^101R|^108R", m):
        return "drum"
    # Explicit laser-toner code families.
    if re.match(r"^(TN|TNP|TK|MLT|ML-D|CLT|CRG|NPG|GPR|C-EXV|CE|CB|CF|TL|CTL|DL|"
                r"Q\d|W\d|106R|006R|013R|50F|60F|58D|B2\d|C540|MX|AR|SP|MP|IM)", m):
        return "toner"
    # Ink code families.
    if re.match(r"^(LC|BT|GT|GI|PG|CL|PGI|CLI|BCI|GC|T\d|S-\d)", m):
        return "ink"
    # Epson short numeric codes (003/008/664/774/113…) are inks.
    if brand == "Epson" and re.match(r"^\d{2,3}[A-Z]?$", m):
        return "ink"
    return "toner"


def slugify(brand: str, model: str) -> str:
    """Canonical, clean slug for a printer model (filler words removed)."""
    raw = _raw_slug(f"{brand} {model}")
    toks = [t for t in raw.split("-") if t and t not in _FILLER_TOKENS]
    return "-".join(toks) or raw


@lru_cache(maxsize=1)
def _build():
    printers = []
    toner_to_printers: dict = {}
    used_slugs: dict = {}
    for brand, model, ptype, toners in PRINTERS_RAW:
        slug = slugify(brand, model)
        # Guard against the rare case where cleaning collides two models:
        # fall back to the full (uncleaned) slug for the later entry.
        if slug in used_slugs and used_slugs[slug] != f"{brand} {model}":
            slug = _raw_slug(f"{brand} {model}")
        used_slugs[slug] = f"{brand} {model}"
        p = {"brand": brand, "model": model, "full_name": f"{brand} {model}",
             "type": ptype, "slug": slug, "toners": list(toners)}
        printers.append(p)
        for t in toners:
            toner_to_printers.setdefault(t, set()).add(f"{brand} {model}")

    toners = {}
    # Derived toners (referenced by printers) — inverse map = compatible printers.
    for model, prs in toner_to_printers.items():
        meta = TONER_META.get(model)
        if meta:
            brand, ttype = meta
        else:
            brand = next((b for b, m, _t, _ts in PRINTERS_RAW if model in _ts), "")
            ttype = _infer_toner_type(brand, model)
        toners[model] = {"brand": brand, "model": model, "type": ttype,
                         "printers": sorted(prs)}
    # Standalone toners (no printer cross-ref in our curated set yet).
    for brand, model, ttype in EXTRA_TONERS:
        if model not in toners:
            toners[model] = {"brand": brand, "model": model, "type": ttype, "printers": []}

    toners_list = sorted(toners.values(), key=lambda x: (x["brand"], x["model"]))
    # Clean, collision-guarded slug for each toner model (e.g. "Q2612A (12A)" -> hp-q2612a).
    used_t: dict = {}
    for t in toners_list:
        s = toner_slugify(t["brand"], t["model"])
        if s in used_t and used_t[s] != t["model"]:
            s = _raw_slug(f"{t['brand']} {t['model']}")
        used_t[s] = t["model"]
        t["slug"] = s
    printers_by_slug = {p["slug"]: p for p in printers}
    toners_by_slug = {t["slug"]: t for t in toners_list}
    return (printers, printers_by_slug, toners_list,
            {t["model"]: t for t in toners_list}, toners_by_slug)


def toner_slugify(brand: str, model: str) -> str:
    """Canonical, clean slug for a toner/consumable model (parenthetical aliases
    and marketing filler removed) — e.g. ("HP", "Q2612A (12A)") -> hp-q2612a."""
    core = (model or "").split("(")[0].strip()
    raw = _raw_slug(f"{brand} {core}")
    toks = [t for t in raw.split("-") if t and t not in _FILLER_TOKENS]
    return "-".join(toks) or raw


@lru_cache(maxsize=1)
def _toner_alias_index():
    toners = _build()[2]
    alias: dict = {}
    token_sets = []
    for t in toners:
        full = _raw_slug(f"{t['brand']} {t['model']}")
        for s in {t["slug"], full}:
            alias.setdefault(s, t)
        token_sets.append((set(full.split("-")), t))
    return alias, token_sets, [t["slug"] for t in toners]


def get_toner_by_slug(slug: str):
    """Resolve a toner/consumable model from a URL slug (same tolerant 4-tier
    approach as printer pages)."""
    if not slug:
        return None
    s = _raw_slug(slug)
    by_slug = _build()[4]
    if s in by_slug:
        return by_slug[s]
    alias, token_sets, canon = _toner_alias_index()
    if s in alias:
        return alias[s]
    cleaned = "-".join(t for t in s.split("-") if t and t not in _FILLER_TOKENS)
    if cleaned in by_slug:
        return by_slug[cleaned]
    if cleaned in alias:
        return alias[cleaned]
    in_tokens = {t for t in s.split("-") if t and t not in _FILLER_TOKENS}
    if in_tokens:
        cands = [(len(toks), t) for toks, t in token_sets if in_tokens <= toks]
        if cands:
            cands.sort(key=lambda x: (x[0], len(x[1]["slug"])))
            return cands[0][1]
    near = get_close_matches(s, canon, n=1, cutoff=0.82)
    if near:
        return by_slug.get(near[0])
    return None


@lru_cache(maxsize=1)
def _alias_index():
    """Map several slug variants per printer -> printer, for tolerant matching:
    canonical slug, full (uncleaned) slug, and the brand+core-model token form.
    Also returns (token_sets, canonical_slugs) for subset/fuzzy fallbacks."""
    printers = _build()[0]
    alias: dict = {}
    token_sets = []
    for p in printers:
        full = _raw_slug(p["full_name"])
        for s in {p["slug"], full}:
            alias.setdefault(s, p)
        tokens = set(full.split("-"))
        token_sets.append((tokens, p))
    return alias, token_sets, [p["slug"] for p in printers]


def all_printers():
    return _build()[0]


def get_printer(slug: str):
    """Resolve a printer from a URL slug, tolerant of marketing/filler words and
    minor model-name variations so SEO/external slugs still land on the page."""
    if not slug:
        return None
    s = _raw_slug(slug)
    by_slug = _build()[1]
    # Tier 1 — exact canonical slug.
    if s in by_slug:
        return by_slug[s]
    alias, token_sets, canon_slugs = _alias_index()
    # Tier 2 — exact alias (full uncleaned slug) or cleaned incoming slug.
    if s in alias:
        return alias[s]
    cleaned = "-".join(t for t in s.split("-") if t and t not in _FILLER_TOKENS)
    if cleaned in by_slug:
        return by_slug[cleaned]
    if cleaned in alias:
        return alias[cleaned]
    # Tier 3 — token subset: all incoming (non-filler) tokens appear in a model.
    in_tokens = {t for t in s.split("-") if t and t not in _FILLER_TOKENS}
    if in_tokens:
        candidates = [(len(toks), p) for toks, p in token_sets if in_tokens <= toks]
        if candidates:
            candidates.sort(key=lambda x: (x[0], len(x[1]["slug"])))
            return candidates[0][1]
    # Tier 4 — closest fuzzy match against canonical slugs.
    near = get_close_matches(s, canon_slugs, n=1, cutoff=0.82)
    if near:
        return by_slug.get(near[0])
    return None


def all_toners():
    return _build()[2]


def get_toner(model: str):
    return _build()[3].get(model)


def search_printers(q: str, limit: int = 20, brand: str = None, brand_only: bool = False):
    q = (q or "").strip().lower()
    items = _build()[0]
    matched = [p for p in items if q in p["full_name"].lower()] if q else list(items)
    if brand:
        b = brand.strip().lower()
        if brand_only:
            matched = [p for p in matched if p["brand"].lower() == b]
        else:
            matched = [p for p in matched if p["brand"].lower() == b] + \
                      [p for p in matched if p["brand"].lower() != b]
    res = matched[:limit]
    return [{"brand": p["brand"], "model": p["model"], "full_name": p["full_name"],
             "type": p["type"], "slug": p["slug"]} for p in res]


def search_toners(q: str, limit: int = 20, brand: str = None):
    q = (q or "").strip().lower()
    items = _build()[2]
    matched = [t for t in items if q in t["model"].lower() or q in t["brand"].lower()] if q else list(items)
    if brand:
        b = brand.strip().lower()
        matched = [t for t in matched if t["brand"].lower() == b] + \
                  [t for t in matched if t["brand"].lower() != b]
    res = matched[:limit]
    return [{"brand": t["brand"], "model": t["model"], "type": t["type"], "slug": t["slug"]} for t in res]


def all_brands():
    """Sorted distinct printer brands in the compatibility DB."""
    return sorted({p["brand"] for p in _build()[0]})


def stats():
    b = _build()
    return {"printers": len(b[0]), "toners": len(b[2])}
