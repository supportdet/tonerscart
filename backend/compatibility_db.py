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
]


def slugify(brand: str, model: str) -> str:
    s = f"{brand} {model}".lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


@lru_cache(maxsize=1)
def _build():
    printers = []
    toner_to_printers: dict = {}
    for brand, model, ptype, toners in PRINTERS_RAW:
        slug = slugify(brand, model)
        p = {"brand": brand, "model": model, "full_name": f"{brand} {model}",
             "type": ptype, "slug": slug, "toners": list(toners)}
        printers.append(p)
        for t in toners:
            toner_to_printers.setdefault(t, set()).add(f"{brand} {model}")

    toners = {}
    # Derived toners (referenced by printers) — inverse map = compatible printers.
    for model, prs in toner_to_printers.items():
        brand, ttype = TONER_META.get(model, (None, "toner"))
        if brand is None:
            brand = next((b for b, m, _t, _ts in PRINTERS_RAW if model in _ts), "")
        toners[model] = {"brand": brand, "model": model, "type": ttype,
                         "printers": sorted(prs)}
    # Standalone toners (no printer cross-ref in our curated set yet).
    for brand, model, ttype in EXTRA_TONERS:
        if model not in toners:
            toners[model] = {"brand": brand, "model": model, "type": ttype, "printers": []}

    toners_list = sorted(toners.values(), key=lambda x: (x["brand"], x["model"]))
    printers_by_slug = {p["slug"]: p for p in printers}
    return printers, printers_by_slug, toners_list, {t["model"]: t for t in toners_list}


def all_printers():
    return _build()[0]


def get_printer(slug: str):
    return _build()[1].get(slug)


def all_toners():
    return _build()[2]


def get_toner(model: str):
    return _build()[3].get(model)


def search_printers(q: str, limit: int = 20):
    q = (q or "").strip().lower()
    items = _build()[0]
    if not q:
        res = items[:limit]
    else:
        res = [p for p in items if q in p["full_name"].lower()][:limit]
    return [{"brand": p["brand"], "model": p["model"], "full_name": p["full_name"],
             "type": p["type"], "slug": p["slug"]} for p in res]


def search_toners(q: str, limit: int = 20):
    q = (q or "").strip().lower()
    items = _build()[2]
    if not q:
        res = items[:limit]
    else:
        res = [t for t in items if q in t["model"].lower() or q in t["brand"].lower()][:limit]
    return [{"brand": t["brand"], "model": t["model"], "type": t["type"]} for t in res]


def stats():
    p, _, t, _2 = _build()
    return {"printers": len(p), "toners": len(t)}
