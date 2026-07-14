using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using WpfButton = System.Windows.Controls.Button;
using WpfTextBox = System.Windows.Controls.TextBox;
using WpfBrushes = System.Windows.Media.Brushes;
using WpfCursors = System.Windows.Input.Cursors;
using WpfOrientation = System.Windows.Controls.Orientation;
using WpfHAlign = System.Windows.HorizontalAlignment;
using WpfVAlign = System.Windows.VerticalAlignment;
using WpfColor = System.Windows.Media.Color;
using WpfRectangle = System.Windows.Shapes.Rectangle;

namespace InteractPresence;

public static class SimplePrompt
{
    private static readonly SolidColorBrush BrandPurple = BrushFrom(0x61, 0x1F, 0x69);
    private static readonly SolidColorBrush SoftBg = BrushFrom(0xF8, 0xFA, 0xFC);
    private static readonly SolidColorBrush BorderSoft = BrushFrom(0xE2, 0xE8, 0xF0);
    private static readonly SolidColorBrush TextMuted = BrushFrom(0x64, 0x74, 0x8B);
    private static readonly SolidColorBrush TextDark = BrushFrom(0x0F, 0x17, 0x2A);

    public static string? Ask(string title, string message, string defaultValue = "")
        => AskInternal(title, message, defaultValue, password: false);

    public static string? AskPassword(string title, string message)
        => AskInternal(title, message, "", password: true);

    private static string? AskInternal(string title, string message, string defaultValue, bool password)
    {
        if (password)
            return ShowPasswordDialog(title, message);

        var win = BuildWindow(title, 400, 170);
        var box = StyledTextBox(defaultValue);
        string? result = null;

        var ok = PrimaryButton("Save");
        var cancel = SecondaryButton("Cancel");
        ok.Click += (_, _) => { result = box.Text; win.DialogResult = true; };
        cancel.Click += (_, _) => { win.DialogResult = false; };
        ok.IsDefault = true;
        cancel.IsCancel = true;

        win.Content = BuildCard(message, box, ButtonRow(ok, cancel));
        win.Loaded += (_, _) => box.Focus();
        return win.ShowDialog() == true ? result : null;
    }

    private static string? ShowPasswordDialog(string title, string message)
    {
        var win = BuildWindow(title, 420, 230);
        string? result = null;

        var pwd = new PasswordBox
        {
            Height = 40,
            Padding = new Thickness(12, 8, 12, 8),
            FontSize = 14,
            BorderBrush = BorderSoft,
            BorderThickness = new Thickness(1),
            Background = WpfBrushes.White,
        };

        var ok = PrimaryButton("OK");
        var cancel = SecondaryButton("Cancel");
        ok.IsDefault = true;
        cancel.IsCancel = true;

        ok.Click += (_, _) => { result = pwd.Password; win.DialogResult = true; };
        cancel.Click += (_, _) => { win.DialogResult = false; };

        var header = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };
        header.Children.Add(new TextBlock
        {
            Text = "ADMIN",
            FontSize = 11,
            FontWeight = FontWeights.Bold,
            Foreground = BrandPurple,
            Margin = new Thickness(0, 0, 0, 4),
        });
        header.Children.Add(new TextBlock
        {
            Text = message.Trim(),
            FontSize = 14,
            FontWeight = FontWeights.SemiBold,
            Foreground = TextDark,
            TextWrapping = TextWrapping.Wrap,
        });

        var body = new StackPanel();
        body.Children.Add(header);
        body.Children.Add(new TextBlock
        {
            Text = "PASSWORD",
            FontSize = 11,
            FontWeight = FontWeights.Bold,
            Foreground = TextMuted,
            Margin = new Thickness(0, 4, 0, 6),
        });
        body.Children.Add(pwd);
        body.Children.Add(ButtonRow(ok, cancel));

        var card = new Border
        {
            Background = SoftBg,
            CornerRadius = new CornerRadius(14),
            BorderBrush = BorderSoft,
            BorderThickness = new Thickness(1),
            Padding = new Thickness(18),
            Margin = new Thickness(14, 16, 14, 14),
            Child = body,
        };

        var accent = new WpfRectangle
        {
            Height = 4,
            Fill = BrandPurple,
            VerticalAlignment = WpfVAlign.Top,
        };

        var root = new Grid { Background = WpfBrushes.White };
        root.Children.Add(accent);
        root.Children.Add(card);
        win.Content = root;

        win.Loaded += (_, _) => pwd.Focus();
        return win.ShowDialog() == true ? result : null;
    }

    private static Window BuildWindow(string title, double width, double height) => new()
    {
        Title = title,
        Width = width,
        Height = height,
        WindowStartupLocation = WindowStartupLocation.CenterScreen,
        ResizeMode = ResizeMode.NoResize,
        Topmost = true,
        Background = WpfBrushes.White,
        WindowStyle = WindowStyle.SingleBorderWindow,
    };

    private static Border BuildCard(string message, UIElement field, UIElement buttons)
    {
        var stack = new StackPanel();
        stack.Children.Add(new TextBlock
        {
            Text = message,
            Margin = new Thickness(0, 0, 0, 10),
            TextWrapping = TextWrapping.Wrap,
            Foreground = TextDark,
            FontSize = 13,
        });
        stack.Children.Add(field);
        stack.Children.Add(buttons);
        return new Border { Padding = new Thickness(16), Child = stack };
    }

    private static WpfTextBox StyledTextBox(string text) => new()
    {
        Text = text,
        Height = 36,
        Padding = new Thickness(10, 6, 10, 6),
        FontSize = 14,
        BorderBrush = BorderSoft,
        BorderThickness = new Thickness(1),
        Background = WpfBrushes.White,
    };

    private static WpfButton PrimaryButton(string label) => new()
    {
        Content = label,
        Width = 92,
        Height = 34,
        Margin = new Thickness(8, 0, 0, 0),
        Background = BrandPurple,
        Foreground = WpfBrushes.White,
        BorderThickness = new Thickness(0),
        FontWeight = FontWeights.SemiBold,
        Cursor = WpfCursors.Hand,
    };

    private static WpfButton SecondaryButton(string label) => new()
    {
        Content = label,
        Width = 92,
        Height = 34,
        Margin = new Thickness(8, 0, 0, 0),
        Background = BrushFrom(0xF1, 0xF5, 0xF9),
        Foreground = TextMuted,
        BorderThickness = new Thickness(0),
        FontWeight = FontWeights.SemiBold,
        Cursor = WpfCursors.Hand,
    };

    private static StackPanel ButtonRow(WpfButton ok, WpfButton cancel)
    {
        var row = new StackPanel
        {
            Orientation = WpfOrientation.Horizontal,
            HorizontalAlignment = WpfHAlign.Right,
            Margin = new Thickness(0, 16, 0, 0),
        };
        row.Children.Add(cancel);
        row.Children.Add(ok);
        return row;
    }

    private static SolidColorBrush BrushFrom(byte r, byte g, byte b)
    {
        var brush = new SolidColorBrush(WpfColor.FromRgb(r, g, b));
        brush.Freeze();
        return brush;
    }
}
