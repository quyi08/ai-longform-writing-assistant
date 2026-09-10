Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $ProjectRoot "assets\rpg-ui"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutPath = Join-Path $OutDir "rpg-ui-icons-40-transparent.png"

$source = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class RpgIconSheetGenerator
{
    const int Cell = 192;
    const int Cols = 5;
    const int Rows = 8;

    static readonly string[][] Items = new string[][]
    {
        new[]{"Attack","sword","#ef4444","#f59e0b","#e5e7eb"},
        new[]{"Blade","sword2","#475569","#60a5fa","#e5e7eb"},
        new[]{"Axe","axe","#7c2d12","#f97316","#d1d5db"},
        new[]{"Bow","bow","#92400e","#facc15","#f59e0b"},
        new[]{"Arrow","arrow","#334155","#a7f3d0","#bfdbfe"},
        new[]{"Fire","flame","#dc2626","#f97316","#facc15"},
        new[]{"Bolt","bolt","#1d4ed8","#facc15","#fde047"},
        new[]{"Ice","crystal","#0284c7","#a5f3fc","#67e8f9"},
        new[]{"Poison","drop","#166534","#84cc16","#22c55e"},
        new[]{"Heal","potion","#be123c","#fb7185","#fda4af"},
        new[]{"Heart","heart","#be123c","#fda4af","#ef4444"},
        new[]{"Shield","shield","#1d4ed8","#facc15","#60a5fa"},
        new[]{"Guard","towerShield","#0f766e","#67e8f9","#2dd4bf"},
        new[]{"Helmet","helmet","#374151","#d1d5db","#9ca3af"},
        new[]{"Boot","boot","#6d28d9","#a78bfa","#c4b5fd"},
        new[]{"Crown","crown","#b45309","#fde68a","#facc15"},
        new[]{"Castle","castle","#334155","#94a3b8","#cbd5e1"},
        new[]{"Chest","chest","#7c2d12","#facc15","#f59e0b"},
        new[]{"Coin","coin","#ca8a04","#fde047","#facc15"},
        new[]{"Scroll","scroll","#78350f","#fef3c7","#fde68a"},
        new[]{"Book","book","#581c87","#c084fc","#d8b4fe"},
        new[]{"Gem","gem","#be123c","#fda4af","#fb7185"},
        new[]{"Crystal","crystal2","#0369a1","#67e8f9","#22d3ee"},
        new[]{"Key","key","#b45309","#fde68a","#fbbf24"},
        new[]{"Lock","lock","#374151","#fbbf24","#9ca3af"},
        new[]{"Skull","skull","#111827","#e5e7eb","#f87171"},
        new[]{"Eye","eye","#1e3a8a","#93c5fd","#60a5fa"},
        new[]{"Compass","compass","#0f766e","#99f6e4","#2dd4bf"},
        new[]{"Pin","pin","#b91c1c","#fecaca","#ef4444"},
        new[]{"Camp","campfire","#c2410c","#fed7aa","#fb923c"},
        new[]{"Tent","tent","#7c2d12","#fde68a","#facc15"},
        new[]{"Horse","horse","#92400e","#fcd34d","#f59e0b"},
        new[]{"Dragon","dragon","#991b1b","#f87171","#ef4444"},
        new[]{"Wolf","wolf","#374151","#cbd5e1","#94a3b8"},
        new[]{"Feather","feather","#dc2626","#facc15","#fb923c"},
        new[]{"Time","hourglass","#78350f","#fde68a","#fbbf24"},
        new[]{"Star","star","#ca8a04","#fef08a","#fde047"},
        new[]{"Fist","fist","#374151","#fca5a5","#d1d5db"},
        new[]{"Wand","wand","#6d28d9","#d8b4fe","#c084fc"},
        new[]{"Sun","sun","#ca8a04","#fed7aa","#facc15"}
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
                DrawBadge(g, x, y, Items[i][2], Items[i][3]);
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

    static void DrawBadge(Graphics g, int x, int y, string primary, string secondary)
    {
        var rect = new RectangleF(x + 24, y + 20, 144, 144);
        using (var brush = new LinearGradientBrush(rect, C(primary), C(secondary), 45))
        using (var dark = P("#111827", 5))
        using (var light = P("#ffffff", 2))
        {
            g.FillEllipse(brush, rect);
            g.DrawEllipse(dark, rect);
            g.DrawEllipse(light, x + 31, y + 27, 130, 130);
        }
    }

    static void DrawShape(Graphics g, int x, int y, string kind, string color)
    {
        float cx = x + 96;
        float cy = y + 92;
        using (var b = B(color))
        using (var gold = B("#facc15"))
        using (var dark = P("#111827", 7))
        using (var light = P("#ffffff", 4))
        {
            switch (kind)
            {
                case "sword":
                    FillPoly(g, b, dark, light, Pt(cx-10,cy+48), Pt(cx+10,cy+48), Pt(cx+17,cy-45), Pt(cx,cy-70), Pt(cx-17,cy-45));
                    g.DrawLine(dark, cx-45, cy+47, cx+45, cy+47); g.DrawLine(light, cx-45, cy+47, cx+45, cy+47);
                    g.FillEllipse(gold, cx-12, cy+56, 24, 24);
                    break;
                case "sword2":
                    g.DrawLine(dark, cx-48, cy+52, cx+48, cy-58); g.DrawLine(light, cx-48, cy+52, cx+48, cy-58);
                    g.DrawLine(dark, cx+45, cy+52, cx-45, cy-55); g.DrawLine(light, cx+45, cy+52, cx-45, cy-55);
                    break;
                case "axe":
                    g.DrawLine(dark, cx-30, cy+62, cx+32, cy-56); g.DrawLine(light, cx-30, cy+62, cx+32, cy-56);
                    FillPoly(g, b, dark, light, Pt(cx+25,cy-58), Pt(cx+72,cy-35), Pt(cx+33,cy-10), Pt(cx+8,cy-35));
                    break;
                case "bow":
                    g.DrawArc(dark, cx-58, cy-65, 82, 130, -80, 160); g.DrawArc(light, cx-58, cy-65, 82, 130, -80, 160);
                    g.DrawLine(dark, cx+15, cy-58, cx+15, cy+58); g.DrawLine(light, cx+15, cy-58, cx+15, cy+58);
                    g.DrawLine(P("#facc15",5), cx-45, cy, cx+70, cy);
                    break;
                case "arrow":
                    g.DrawLine(dark, cx-55, cy+45, cx+48, cy-58); g.DrawLine(light, cx-55, cy+45, cx+48, cy-58);
                    FillPoly(g, b, dark, light, Pt(cx+48,cy-58), Pt(cx+65,cy-18), Pt(cx+27,cy-36));
                    break;
                case "flame":
                    FillPoly(g, b, dark, light, Pt(cx,cy-70), Pt(cx+45,cy-15), Pt(cx+18,cy+62), Pt(cx-36,cy+48), Pt(cx-20,cy-12));
                    break;
                case "bolt":
                    FillPoly(g, b, dark, light, Pt(cx+18,cy-70), Pt(cx-30,cy+2), Pt(cx+3,cy+2), Pt(cx-18,cy+70), Pt(cx+46,cy-15), Pt(cx+10,cy-15));
                    break;
                case "crystal":
                case "gem":
                case "crystal2":
                    FillPoly(g, b, dark, light, Pt(cx,cy-68), Pt(cx+58,cy-12), Pt(cx,cy+68), Pt(cx-58,cy-12));
                    g.DrawLine(light, cx, cy-60, cx, cy+58);
                    break;
                case "drop":
                    FillPoly(g, b, dark, light, Pt(cx,cy-68), Pt(cx+44,cy+5), Pt(cx+20,cy+58), Pt(cx-20,cy+58), Pt(cx-44,cy+5));
                    break;
                case "potion":
                    g.FillRectangle(gold, cx-18, cy-66, 36, 24);
                    g.FillEllipse(b, cx-46, cy-28, 92, 92); g.DrawEllipse(dark, cx-46, cy-28, 92, 92); g.DrawEllipse(light, cx-46, cy-28, 92, 92);
                    break;
                case "heart":
                    g.FillEllipse(b, cx-52, cy-42, 58, 58); g.FillEllipse(b, cx-6, cy-42, 58, 58);
                    FillPoly(g, b, dark, light, Pt(cx-58,cy-18), Pt(cx+58,cy-18), Pt(cx,cy+70));
                    break;
                case "shield":
                case "towerShield":
                case "helmet":
                case "castle":
                case "tent":
                    FillPoly(g, b, dark, light, Pt(cx,cy-68), Pt(cx+55,cy-38), Pt(cx+42,cy+35), Pt(cx,cy+70), Pt(cx-42,cy+35), Pt(cx-55,cy-38));
                    break;
                case "boot":
                    FillPoly(g, b, dark, light, Pt(cx-48,cy-55), Pt(cx+3,cy-55), Pt(cx+6,cy+15), Pt(cx+58,cy+35), Pt(cx+40,cy+58), Pt(cx-48,cy+36));
                    break;
                case "crown":
                    FillPoly(g, b, dark, light, Pt(cx-60,cy+38), Pt(cx-48,cy-32), Pt(cx-18,cy+12), Pt(cx,cy-60), Pt(cx+18,cy+12), Pt(cx+48,cy-32), Pt(cx+60,cy+38));
                    g.FillRectangle(gold, cx-58, cy+34, 116, 24);
                    break;
                case "chest":
                case "book":
                case "scroll":
                case "lock":
                    g.FillRectangle(b, cx-55, cy-45, 110, 95); g.DrawRectangle(dark, cx-55, cy-45, 110, 95); g.DrawRectangle(light, cx-55, cy-45, 110, 95);
                    g.DrawLine(light, cx-55, cy, cx+55, cy);
                    break;
                case "coin":
                case "eye":
                case "horse":
                case "dragon":
                case "wolf":
                case "fist":
                    g.FillEllipse(b, cx-58, cy-58, 116, 116); g.DrawEllipse(dark, cx-58, cy-58, 116, 116); g.DrawEllipse(light, cx-58, cy-58, 116, 116);
                    break;
                case "key":
                case "wand":
                    g.DrawLine(dark, cx-10, cy+15, cx+58, cy-58); g.DrawLine(light, cx-10, cy+15, cx+58, cy-58);
                    g.DrawEllipse(dark, cx-64, cy+4, 54, 54); g.DrawEllipse(light, cx-64, cy+4, 54, 54);
                    g.FillEllipse(b, cx-49, cy+19, 24, 24);
                    break;
                case "skull":
                    g.FillEllipse(b, cx-52, cy-60, 104, 104); g.DrawEllipse(dark, cx-52, cy-60, 104, 104); g.DrawEllipse(light, cx-52, cy-60, 104, 104);
                    g.FillEllipse(Brushes.Red, cx-30, cy-20, 20, 20); g.FillEllipse(Brushes.Red, cx+10, cy-20, 20, 20);
                    break;
                case "compass":
                case "star":
                case "campfire":
                case "feather":
                case "sun":
                case "hourglass":
                default:
                    FillPoly(g, b, dark, light, Pt(cx,cy-70), Pt(cx+18,cy-20), Pt(cx+68,cy-18), Pt(cx+26,cy+10), Pt(cx+42,cy+62), Pt(cx,cy+32), Pt(cx-42,cy+62), Pt(cx-26,cy+10), Pt(cx-68,cy-18), Pt(cx-18,cy-20));
                    break;
            }
        }
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies "System.Drawing"
[RpgIconSheetGenerator]::Generate($OutPath)
Write-Host $OutPath
