Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $ProjectRoot "assets\rpg-ui"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutPath = Join-Path $OutDir "xianxia-map-markers-40-transparent.png"

$source = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class XianxiaMapMarkerSheetGenerator
{
    const int Cell = 192;
    const int Cols = 5;
    const int Rows = 8;

    static readonly string[][] Items = new string[][]
    {
        new[]{"Sect","sect","#0f766e","#99f6e4","#fde68a"},
        new[]{"Immortal City","palace","#0369a1","#a5f3fc","#facc15"},
        new[]{"Heaven Gate","gate","#312e81","#c4b5fd","#fef3c7"},
        new[]{"Cave Mansion","cave","#78350f","#fde68a","#facc15"},
        new[]{"Spirit Mountain","mountain","#14532d","#86efac","#e0f2fe"},
        new[]{"Sword Peak","swordPeak","#1e3a8a","#93c5fd","#e5e7eb"},
        new[]{"Alchemy Hall","cauldron","#7c2d12","#f97316","#facc15"},
        new[]{"Scripture Hall","scroll","#581c87","#c084fc","#fef3c7"},
        new[]{"Artifact Forge","forge","#991b1b","#fb923c","#fde68a"},
        new[]{"Training Field","arena","#0f766e","#99f6e4","#facc15"},
        new[]{"Secret Realm","portal","#581c87","#f0abfc","#22d3ee"},
        new[]{"Blessed Land","island","#0e7490","#67e8f9","#fde68a"},
        new[]{"Ancient Ruins","ruins","#57534e","#d6d3d1","#fef3c7"},
        new[]{"Immortal Tomb","tomb","#374151","#d1d5db","#a78bfa"},
        new[]{"Sword Tomb","swordTomb","#1f2937","#9ca3af","#e5e7eb"},
        new[]{"Demon Cave","demon","#7f1d1d","#ef4444","#f97316"},
        new[]{"Ghost Market","ghost","#312e81","#a78bfa","#c4b5fd"},
        new[]{"Evil Sect","evilSect","#450a0a","#dc2626","#fca5a5"},
        new[]{"Dragon Palace","dragonPalace","#0e7490","#67e8f9","#facc15"},
        new[]{"Phoenix Nest","phoenix","#b91c1c","#fb923c","#fde047"},
        new[]{"Spirit Spring","spring","#0284c7","#a5f3fc","#22d3ee"},
        new[]{"Herb Valley","herb","#166534","#86efac","#bef264"},
        new[]{"Peach Grove","peach","#be123c","#fda4af","#fef3c7"},
        new[]{"Bamboo Sea","bamboo","#166534","#bbf7d0","#86efac"},
        new[]{"Thunder Pool","thunder","#1d4ed8","#facc15","#fde047"},
        new[]{"Ice Palace","ice","#0369a1","#a5f3fc","#e0f2fe"},
        new[]{"Fire Vein","flame","#dc2626","#f97316","#facc15"},
        new[]{"Earth Vein","vein","#92400e","#fcd34d","#fde68a"},
        new[]{"Teleport Array","array","#312e81","#a78bfa","#22d3ee"},
        new[]{"Stargazing Tower","starTower","#1e1b4b","#818cf8","#fef08a"},
        new[]{"Karma Altar","altar","#7c2d12","#fde68a","#ef4444"},
        new[]{"Tribulation Zone","tribulation","#1d4ed8","#93c5fd","#facc15"},
        new[]{"Forbidden Land","forbidden","#111827","#64748b","#ef4444"},
        new[]{"Ancient Battlefield","battlefield","#7c2d12","#f87171","#e5e7eb"},
        new[]{"Beast Mountain","beast","#374151","#cbd5e1","#ef4444"},
        new[]{"Demon Tower","demonTower","#450a0a","#dc2626","#facc15"},
        new[]{"Cloud Bridge","cloudBridge","#0284c7","#bae6fd","#fef3c7"},
        new[]{"Moon Lake","moonLake","#312e81","#a5b4fc","#e0f2fe"},
        new[]{"Sun Terrace","sun","#ca8a04","#fed7aa","#fef08a"},
        new[]{"Dao Monument","monument","#1e293b","#94a3b8","#fef3c7"}
    };

    public static void Generate(string outPath)
    {
        using (var bmp = new Bitmap(Cell * Cols, Cell * Rows, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            for (int i = 0; i < Items.Length; i++)
            {
                int x = (i % Cols) * Cell;
                int y = (i / Cols) * Cell;
                DrawSealPin(g, x, y, Items[i][2], Items[i][3]);
                DrawShape(g, x, y, Items[i][1], Items[i][4]);
            }

            bmp.Save(outPath, ImageFormat.Png);
        }
    }

    static Color C(string hex) { return ColorTranslator.FromHtml(hex); }
    static SolidBrush B(string hex) { return new SolidBrush(C(hex)); }
    static Pen P(string hex, float w) { return new Pen(C(hex), w) { LineJoin = LineJoin.Round, StartCap = LineCap.Round, EndCap = LineCap.Round }; }
    static PointF Pt(float x, float y) { return new PointF(x, y); }

    static void FillPoly(Graphics g, Brush b, Pen dark, Pen light, params PointF[] pts)
    {
        g.FillPolygon(b, pts);
        g.DrawPolygon(dark, pts);
        g.DrawPolygon(light, pts);
    }

    static void DrawSealPin(Graphics g, int x, int y, string primary, string secondary)
    {
        float cx = x + 96;
        using (var brush = new LinearGradientBrush(new RectangleF(x + 23, y + 10, 146, 160), C(primary), C(secondary), 45))
        using (var dark = P("#10201f", 5))
        using (var light = P("#ffffff", 2))
        using (var gold = P("#fde68a", 3))
        {
            PointF[] seal = new PointF[] {
                Pt(cx, y + 174), Pt(x + 42, y + 105), Pt(x + 33, y + 56),
                Pt(x + 55, y + 25), Pt(cx, y + 8), Pt(x + 137, y + 25),
                Pt(x + 159, y + 56), Pt(x + 150, y + 105)
            };
            g.FillPolygon(brush, seal);
            g.DrawPolygon(dark, seal);
            g.DrawPolygon(light, seal);
            g.DrawEllipse(gold, x + 54, y + 28, 84, 84);
        }
    }

    static void DrawShape(Graphics g, int x, int y, string kind, string color)
    {
        float cx = x + 96;
        float cy = y + 76;
        using (var b = B(color))
        using (var pale = B("#fef3c7"))
        using (var gold = B("#facc15"))
        using (var dark = P("#10201f", 6))
        using (var light = P("#ffffff", 3))
        {
            switch (kind)
            {
                case "sect":
                case "palace":
                    g.FillRectangle(b, cx-50, cy-5, 100, 50); g.DrawRectangle(light, cx-50, cy-5, 100, 50);
                    FillPoly(g,b,dark,light, Pt(cx-58,cy-5),Pt(cx,cy-52),Pt(cx+58,cy-5));
                    g.FillRectangle(gold, cx-8, cy+12, 16, 33);
                    break;
                case "gate":
                    g.FillRectangle(b, cx-55, cy-38, 110, 82); g.DrawRectangle(dark, cx-55, cy-38, 110, 82); g.DrawRectangle(light, cx-55, cy-38, 110, 82);
                    g.FillEllipse(new SolidBrush(Color.FromArgb(190, 20, 20, 60)), cx-30, cy-5, 60, 55);
                    break;
                case "cave":
                    FillPoly(g,b,dark,light, Pt(cx-62,cy+50),Pt(cx-50,cy-22),Pt(cx,cy-60),Pt(cx+50,cy-22),Pt(cx+62,cy+50));
                    g.FillEllipse(Brushes.Black, cx-30, cy+2, 60, 50);
                    break;
                case "mountain":
                case "swordPeak":
                case "beast":
                    FillPoly(g,b,dark,light, Pt(cx-64,cy+58),Pt(cx,cy-62),Pt(cx+64,cy+58));
                    if(kind=="swordPeak"){ g.DrawLine(light,cx,cy-62,cx,cy+50); }
                    break;
                case "cauldron":
                    g.FillEllipse(b, cx-48, cy-10, 96, 68); g.DrawEllipse(dark, cx-48, cy-10, 96, 68); g.DrawEllipse(light, cx-48, cy-10, 96, 68);
                    g.DrawLine(dark,cx-35,cy+42,cx-50,cy+70); g.DrawLine(dark,cx+35,cy+42,cx+50,cy+70);
                    break;
                case "scroll":
                    g.FillRectangle(pale, cx-50, cy-35, 100, 70); g.DrawRectangle(dark, cx-50, cy-35, 100, 70); g.DrawLine(light,cx-30,cy-10,cx+30,cy-10); g.DrawLine(light,cx-30,cy+10,cx+25,cy+10);
                    break;
                case "forge":
                    FillPoly(g,b,dark,light, Pt(cx-50,cy+48),Pt(cx-20,cy-45),Pt(cx+45,cy+10),Pt(cx+50,cy+48));
                    g.FillEllipse(gold,cx-22,cy+4,44,44);
                    break;
                case "arena":
                    g.DrawEllipse(dark, cx-58, cy-42, 116, 84); g.DrawEllipse(light, cx-58, cy-42, 116, 84); g.DrawLine(light,cx-44,cy,cx+44,cy);
                    break;
                case "portal":
                case "array":
                    g.DrawEllipse(dark, cx-52, cy-58, 104, 116); g.DrawEllipse(light, cx-52, cy-58, 104, 116); g.FillEllipse(b,cx-31,cy-35,62,76);
                    g.DrawEllipse(P("#22d3ee",3), cx-34, cy-38, 68, 82);
                    break;
                case "island":
                    g.FillEllipse(b,cx-58,cy+6,116,46); g.DrawEllipse(light,cx-58,cy+6,116,46);
                    FillPoly(g,gold,dark,light,Pt(cx-20,cy+8),Pt(cx,cy-44),Pt(cx+20,cy+8));
                    break;
                case "ruins":
                case "altar":
                    g.FillRectangle(b,cx-55,cy+35,110,18); g.DrawRectangle(light,cx-55,cy+35,110,18);
                    for(int i=0;i<4;i++){ g.FillRectangle(b,cx-45+i*30,cy-35,16,70); g.DrawRectangle(light,cx-45+i*30,cy-35,16,70); }
                    break;
                case "tomb":
                case "swordTomb":
                    g.FillPie(b,cx-42,cy-55,84,84,180,180); g.FillRectangle(b,cx-42,cy-13,84,68); g.DrawRectangle(light,cx-42,cy-13,84,68);
                    if(kind=="swordTomb"){ g.DrawLine(light,cx,cy-45,cx,cy+45); }
                    break;
                case "demon":
                case "evilSect":
                case "demonTower":
                    FillPoly(g,b,dark,light, Pt(cx-56,cy+36),Pt(cx-28,cy-22),Pt(cx,cy-5),Pt(cx+28,cy-22),Pt(cx+56,cy+36),Pt(cx,cy+60));
                    g.FillPolygon(gold,new PointF[]{Pt(cx-50,cy-20),Pt(cx-20,cy-44),Pt(cx-30,cy-4)});
                    g.FillPolygon(gold,new PointF[]{Pt(cx+50,cy-20),Pt(cx+20,cy-44),Pt(cx+30,cy-4)});
                    break;
                case "ghost":
                    g.FillEllipse(b,cx-45,cy-55,90,96); g.DrawEllipse(light,cx-45,cy-55,90,96); FillPoly(g,b,dark,light,Pt(cx-45,cy+28),Pt(cx-25,cy+60),Pt(cx,cy+30),Pt(cx+25,cy+60),Pt(cx+45,cy+28));
                    break;
                case "dragonPalace":
                    g.FillRectangle(b,cx-52,cy-8,104,54); g.DrawRectangle(light,cx-52,cy-8,104,54); g.DrawArc(P("#fde68a",4),cx-56,cy-58,112,70,180,180);
                    break;
                case "phoenix":
                    FillPoly(g,b,dark,light, Pt(cx,cy-62),Pt(cx+58,cy+20),Pt(cx+20,cy+18),Pt(cx+32,cy+62),Pt(cx,cy+32),Pt(cx-32,cy+62),Pt(cx-20,cy+18),Pt(cx-58,cy+20));
                    break;
                case "spring":
                case "moonLake":
                    g.FillEllipse(b,cx-58,cy+5,116,50); g.DrawEllipse(light,cx-58,cy+5,116,50); g.DrawArc(P("#ffffff",3),cx-40,cy-10,80,40,0,180);
                    break;
                case "herb":
                case "bamboo":
                    g.DrawLine(dark,cx,cy+55,cx,cy-55); g.DrawLine(light,cx,cy+55,cx,cy-55);
                    for(int i=-2;i<=2;i++){ g.FillEllipse(b,cx+i*16,cy-20+i*10,36,24); }
                    break;
                case "peach":
                    g.FillEllipse(b,cx-45,cy-40,90,86); g.DrawEllipse(light,cx-45,cy-40,90,86); g.FillEllipse(pale,cx-16,cy-18,32,28);
                    break;
                case "thunder":
                case "tribulation":
                    FillPoly(g,b,dark,light, Pt(cx+18,cy-66),Pt(cx-30,cy+2),Pt(cx+4,cy+2),Pt(cx-18,cy+68),Pt(cx+46,cy-16),Pt(cx+10,cy-16));
                    break;
                case "ice":
                    FillPoly(g,b,dark,light, Pt(cx,cy-66),Pt(cx+50,cy-15),Pt(cx,cy+66),Pt(cx-50,cy-15)); g.DrawLine(light,cx,cy-55,cx,cy+55);
                    break;
                case "flame":
                    FillPoly(g,b,dark,light, Pt(cx,cy-68),Pt(cx+44,cy-10),Pt(cx+15,cy+62),Pt(cx-35,cy+45),Pt(cx-18,cy-15));
                    break;
                case "vein":
                    g.DrawLine(dark,cx-48,cy+50,cx+42,cy-52); g.DrawLine(light,cx-48,cy+50,cx+42,cy-52); g.FillEllipse(b,cx-20,cy-15,40,40);
                    break;
                case "starTower":
                    FillPoly(g,b,dark,light,Pt(cx-32,cy+58),Pt(cx-20,cy-32),Pt(cx,cy-62),Pt(cx+20,cy-32),Pt(cx+32,cy+58)); FillPoly(g,gold,dark,light,Pt(cx,cy-70),Pt(cx+12,cy-42),Pt(cx+40,cy-40),Pt(cx+16,cy-24),Pt(cx+25,cy+5),Pt(cx,cy-12),Pt(cx-25,cy+5),Pt(cx-16,cy-24),Pt(cx-40,cy-40),Pt(cx-12,cy-42));
                    break;
                case "forbidden":
                case "battlefield":
                    g.FillEllipse(b,cx-54,cy-54,108,108); g.DrawEllipse(dark,cx-54,cy-54,108,108); g.DrawEllipse(light,cx-54,cy-54,108,108); g.DrawLine(P("#ef4444",7),cx-36,cy-36,cx+36,cy+36);
                    break;
                case "cloudBridge":
                    g.DrawArc(dark,cx-58,cy-20,116,90,180,180); g.DrawArc(light,cx-58,cy-20,116,90,180,180); g.FillEllipse(pale,cx-45,cy+28,90,30);
                    break;
                case "sun":
                    FillPoly(g,b,dark,light,Pt(cx,cy-62),Pt(cx+18,cy-18),Pt(cx+62,cy),Pt(cx+18,cy+18),Pt(cx,cy+62),Pt(cx-18,cy+18),Pt(cx-62,cy),Pt(cx-18,cy-18)); g.FillEllipse(gold,cx-25,cy-25,50,50);
                    break;
                case "monument":
                default:
                    FillPoly(g,b,dark,light, Pt(cx,cy-64),Pt(cx+28,cy-30),Pt(cx+20,cy+55),Pt(cx-20,cy+55),Pt(cx-28,cy-30));
                    break;
            }
        }
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Drawing"
[XianxiaMapMarkerSheetGenerator]::Generate($OutPath)
Write-Host $OutPath
