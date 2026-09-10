Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $ProjectRoot "assets\rpg-ui"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutPath = Join-Path $OutDir "world-map-markers-40-transparent.png"

$source = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class WorldMapMarkerSheetGenerator
{
    const int Cell = 192;
    const int Cols = 5;
    const int Rows = 8;

    static readonly string[][] Items = new string[][]
    {
        new[]{"Castle","castle","#334155","#94a3b8","#facc15"},
        new[]{"Capital","crown","#7c2d12","#fde68a","#f59e0b"},
        new[]{"Fort","tower","#1f2937","#9ca3af","#e5e7eb"},
        new[]{"Village","house","#92400e","#fde68a","#fbbf24"},
        new[]{"City","city","#475569","#cbd5e1","#60a5fa"},
        new[]{"Dungeon","gate","#111827","#64748b","#ef4444"},
        new[]{"Cave","cave","#3f2f24","#a16207","#fbbf24"},
        new[]{"Mine","pick","#78350f","#facc15","#d1d5db"},
        new[]{"Ruins","ruins","#57534e","#d6d3d1","#fde68a"},
        new[]{"Temple","temple","#7c3aed","#ddd6fe","#facc15"},
        new[]{"Demon","horns","#7f1d1d","#ef4444","#f97316"},
        new[]{"Dragon","dragon","#991b1b","#f87171","#facc15"},
        new[]{"Lair","claw","#450a0a","#dc2626","#fca5a5"},
        new[]{"Portal","portal","#312e81","#a78bfa","#22d3ee"},
        new[]{"Rift","rift","#581c87","#c084fc","#f0abfc"},
        new[]{"Forest","tree","#14532d","#86efac","#22c55e"},
        new[]{"Ancient","obelisk","#1e293b","#94a3b8","#fef3c7"},
        new[]{"Shrine","shrine","#0f766e","#99f6e4","#fde68a"},
        new[]{"Grave","grave","#374151","#d1d5db","#a3a3a3"},
        new[]{"Swamp","swamp","#365314","#84cc16","#a3e635"},
        new[]{"Harbor","anchor","#0e7490","#67e8f9","#facc15"},
        new[]{"Ship","ship","#78350f","#fde68a","#60a5fa"},
        new[]{"Bridge","bridge","#7c2d12","#fbbf24","#fde68a"},
        new[]{"Road","road","#57534e","#e7e5e4","#facc15"},
        new[]{"Camp","camp","#c2410c","#fed7aa","#fb923c"},
        new[]{"Tower","mageTower","#312e81","#a5b4fc","#facc15"},
        new[]{"Academy","book","#581c87","#c084fc","#d8b4fe"},
        new[]{"Market","coin","#ca8a04","#fde047","#facc15"},
        new[]{"Guild","banner","#1d4ed8","#93c5fd","#facc15"},
        new[]{"Arena","arena","#7c2d12","#f97316","#e5e7eb"},
        new[]{"Volcano","volcano","#7f1d1d","#ef4444","#f97316"},
        new[]{"Mountain","mountain","#334155","#cbd5e1","#e5e7eb"},
        new[]{"Oasis","oasis","#0f766e","#99f6e4","#facc15"},
        new[]{"Desert","pyramid","#92400e","#fde68a","#f59e0b"},
        new[]{"Icehold","iceCastle","#0369a1","#a5f3fc","#e0f2fe"},
        new[]{"Witch","moon","#312e81","#a78bfa","#facc15"},
        new[]{"Beast","wolf","#374151","#cbd5e1","#ef4444"},
        new[]{"Treasure","chest","#78350f","#facc15","#f59e0b"},
        new[]{"Quest","scroll","#78350f","#fef3c7","#dc2626"},
        new[]{"Danger","skull","#111827","#e5e7eb","#ef4444"}
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
                DrawPin(g, x, y, Items[i][2], Items[i][3]);
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

    static void DrawPin(Graphics g, int x, int y, string primary, string secondary)
    {
        float cx = x + 96;
        float cy = y + 88;
        using (var brush = new LinearGradientBrush(new RectangleF(x + 25, y + 12, 142, 158), C(primary), C(secondary), 45))
        using (var dark = P("#111827", 5))
        using (var light = P("#ffffff", 2))
        {
            PointF[] pin = new PointF[] {
                Pt(cx, y + 174), Pt(x + 44, y + 98), Pt(x + 35, y + 54),
                Pt(x + 58, y + 22), Pt(cx, y + 10), Pt(x + 134, y + 22),
                Pt(x + 157, y + 54), Pt(x + 148, y + 98)
            };
            g.FillPolygon(brush, pin);
            g.DrawPolygon(dark, pin);
            g.DrawPolygon(light, pin);
            g.FillEllipse(new SolidBrush(Color.FromArgb(55, 255, 255, 255)), x + 58, y + 28, 76, 76);
        }
    }

    static void DrawShape(Graphics g, int x, int y, string kind, string color)
    {
        float cx = x + 96;
        float cy = y + 76;
        using (var b = B(color))
        using (var gold = B("#facc15"))
        using (var dark = P("#111827", 6))
        using (var light = P("#ffffff", 3))
        {
            switch (kind)
            {
                case "castle":
                case "city":
                case "iceCastle":
                    g.FillRectangle(b, cx-48, cy-12, 96, 55); g.DrawRectangle(dark, cx-48, cy-12, 96, 55); g.DrawRectangle(light, cx-48, cy-12, 96, 55);
                    g.FillRectangle(b, cx-60, cy-42, 28, 85); g.FillRectangle(b, cx+32, cy-42, 28, 85); g.DrawRectangle(light, cx-60, cy-42, 28, 85); g.DrawRectangle(light, cx+32, cy-42, 28, 85);
                    break;
                case "crown":
                    FillPoly(g,b,dark,light, Pt(cx-54,cy+35),Pt(cx-42,cy-28),Pt(cx-14,cy+8),Pt(cx,cy-50),Pt(cx+14,cy+8),Pt(cx+42,cy-28),Pt(cx+54,cy+35));
                    g.FillRectangle(gold, cx-52, cy+30, 104, 18);
                    break;
                case "tower":
                case "mageTower":
                    FillPoly(g,b,dark,light, Pt(cx-36,cy+48),Pt(cx-28,cy-35),Pt(cx,cy-64),Pt(cx+28,cy-35),Pt(cx+36,cy+48));
                    break;
                case "house":
                    FillPoly(g,b,dark,light, Pt(cx-55,cy),Pt(cx,cy-48),Pt(cx+55,cy),Pt(cx+44,cy+52),Pt(cx-44,cy+52));
                    break;
                case "gate":
                    g.FillRectangle(b, cx-52, cy-42, 104, 86); g.DrawRectangle(dark, cx-52, cy-42, 104, 86); g.DrawRectangle(light, cx-52, cy-42, 104, 86);
                    g.FillEllipse(Brushes.Black, cx-28, cy-10, 56, 60);
                    break;
                case "cave":
                    FillPoly(g,b,dark,light, Pt(cx-62,cy+50),Pt(cx-50,cy-20),Pt(cx,cy-58),Pt(cx+50,cy-20),Pt(cx+62,cy+50));
                    g.FillEllipse(Brushes.Black, cx-30, cy+2, 60, 50);
                    break;
                case "pick":
                    g.DrawLine(dark, cx-42, cy+52, cx+36, cy-42); g.DrawLine(light, cx-42, cy+52, cx+36, cy-42);
                    g.DrawArc(dark, cx-50, cy-60, 110, 60, 190, 150); g.DrawArc(light, cx-50, cy-60, 110, 60, 190, 150);
                    break;
                case "ruins":
                case "temple":
                case "shrine":
                    g.FillRectangle(b, cx-56, cy+35, 112, 18); g.DrawRectangle(light, cx-56, cy+35, 112, 18);
                    for(int i=0;i<4;i++){ g.FillRectangle(b, cx-45+i*30, cy-35, 16, 70); g.DrawRectangle(light, cx-45+i*30, cy-35, 16, 70); }
                    break;
                case "horns":
                case "dragon":
                    FillPoly(g,b,dark,light, Pt(cx-56,cy+35),Pt(cx-28,cy-22),Pt(cx,cy-6),Pt(cx+28,cy-22),Pt(cx+56,cy+35),Pt(cx,cy+58));
                    g.FillPolygon(gold, new PointF[]{Pt(cx-50,cy-20),Pt(cx-20,cy-42),Pt(cx-30,cy-4)});
                    g.FillPolygon(gold, new PointF[]{Pt(cx+50,cy-20),Pt(cx+20,cy-42),Pt(cx+30,cy-4)});
                    break;
                case "claw":
                    for(int i=0;i<3;i++){ g.DrawLine(dark, cx-30+i*30, cy+45, cx-45+i*30, cy-45); g.DrawLine(light, cx-30+i*30, cy+45, cx-45+i*30, cy-45); }
                    break;
                case "portal":
                case "rift":
                    g.DrawEllipse(dark, cx-48, cy-55, 96, 110); g.DrawEllipse(light, cx-48, cy-55, 96, 110); g.FillEllipse(b, cx-28, cy-34, 56, 68);
                    break;
                case "tree":
                    FillPoly(g,b,dark,light, Pt(cx,cy-60),Pt(cx+52,cy+18),Pt(cx+20,cy+18),Pt(cx+42,cy+55),Pt(cx-42,cy+55),Pt(cx-20,cy+18),Pt(cx-52,cy+18));
                    break;
                case "obelisk":
                    FillPoly(g,b,dark,light, Pt(cx,cy-64),Pt(cx+28,cy-30),Pt(cx+20,cy+55),Pt(cx-20,cy+55),Pt(cx-28,cy-30));
                    break;
                case "grave":
                    g.FillPie(b, cx-40, cy-52, 80, 80, 180, 180); g.FillRectangle(b, cx-40, cy-12, 80, 70); g.DrawRectangle(light, cx-40, cy-12, 80, 70);
                    break;
                case "swamp":
                    g.FillEllipse(b, cx-58, cy+5, 116, 50); g.DrawEllipse(light, cx-58, cy+5, 116, 50);
                    g.DrawLine(dark, cx-40, cy-35, cx-10, cy+10); g.DrawLine(light, cx-40, cy-35, cx-10, cy+10);
                    break;
                case "anchor":
                    g.DrawLine(dark, cx, cy-55, cx, cy+48); g.DrawLine(light, cx, cy-55, cx, cy+48);
                    g.DrawArc(dark, cx-50, cy-5, 100, 80, 10, 160); g.DrawArc(light, cx-50, cy-5, 100, 80, 10, 160);
                    break;
                case "ship":
                    FillPoly(g,b,dark,light, Pt(cx-58,cy+18),Pt(cx+58,cy+18),Pt(cx+34,cy+55),Pt(cx-34,cy+55));
                    FillPoly(g,gold,dark,light, Pt(cx,cy-55),Pt(cx+42,cy+5),Pt(cx,cy+5));
                    break;
                case "bridge":
                case "road":
                    g.DrawArc(dark, cx-58, cy-20, 116, 90, 180, 180); g.DrawArc(light, cx-58, cy-20, 116, 90, 180, 180);
                    g.DrawLine(dark, cx-58, cy+24, cx+58, cy+24); g.DrawLine(light, cx-58, cy+24, cx+58, cy+24);
                    break;
                case "camp":
                    FillPoly(g,b,dark,light, Pt(cx-55,cy+50),Pt(cx,cy-55),Pt(cx+55,cy+50));
                    break;
                case "book":
                case "scroll":
                case "banner":
                case "chest":
                    g.FillRectangle(b, cx-52, cy-42, 104, 88); g.DrawRectangle(dark, cx-52, cy-42, 104, 88); g.DrawRectangle(light, cx-52, cy-42, 104, 88);
                    break;
                case "coin":
                    g.FillEllipse(b, cx-52, cy-52, 104, 104); g.DrawEllipse(dark, cx-52, cy-52, 104, 104); g.DrawEllipse(light, cx-52, cy-52, 104, 104);
                    break;
                case "arena":
                    g.DrawEllipse(dark, cx-58, cy-42, 116, 84); g.DrawEllipse(light, cx-58, cy-42, 116, 84);
                    g.DrawRectangle(light, cx-38, cy-20, 76, 40);
                    break;
                case "volcano":
                case "mountain":
                case "pyramid":
                    FillPoly(g,b,dark,light, Pt(cx-62,cy+58),Pt(cx,cy-58),Pt(cx+62,cy+58));
                    break;
                case "oasis":
                    g.FillEllipse(b, cx-54, cy+10, 108, 44); g.DrawEllipse(light, cx-54, cy+10, 108, 44);
                    g.DrawLine(dark, cx, cy+10, cx+30, cy-45); g.DrawLine(light, cx, cy+10, cx+30, cy-45);
                    break;
                case "moon":
                    g.FillEllipse(b, cx-45, cy-50, 90, 100); g.FillEllipse(new SolidBrush(Color.FromArgb(230, 40, 30, 90)), cx-20, cy-52, 90, 104);
                    g.DrawEllipse(light, cx-45, cy-50, 90, 100);
                    break;
                case "wolf":
                    FillPoly(g,b,dark,light, Pt(cx-55,cy-18),Pt(cx-25,cy-55),Pt(cx,cy-20),Pt(cx+25,cy-55),Pt(cx+55,cy-18),Pt(cx+32,cy+50),Pt(cx,cy+62),Pt(cx-32,cy+50));
                    break;
                case "skull":
                    g.FillEllipse(b, cx-48, cy-54, 96, 96); g.DrawEllipse(dark, cx-48, cy-54, 96, 96); g.DrawEllipse(light, cx-48, cy-54, 96, 96);
                    g.FillEllipse(Brushes.Red, cx-25, cy-18, 18, 18); g.FillEllipse(Brushes.Red, cx+7, cy-18, 18, 18);
                    break;
                default:
                    FillPoly(g,b,dark,light, Pt(cx,cy-58),Pt(cx+55,cy),Pt(cx,cy+58),Pt(cx-55,cy));
                    break;
            }
        }
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Drawing"
[WorldMapMarkerSheetGenerator]::Generate($OutPath)
Write-Host $OutPath
