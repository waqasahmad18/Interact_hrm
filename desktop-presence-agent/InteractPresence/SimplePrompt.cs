using System.Windows;
using System.Windows.Controls;

namespace InteractPresence;

public static class SimplePrompt
{
    public static string? Ask(string title, string message, string defaultValue = "")
    {
        var win = new Window
        {
            Title = title,
            Width = 360,
            Height = 160,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            ResizeMode = ResizeMode.NoResize,
            Topmost = true,
        };
        var box = new System.Windows.Controls.TextBox { Text = defaultValue, Margin = new Thickness(12) };
        var ok = new System.Windows.Controls.Button { Content = "Save", Width = 80, Margin = new Thickness(8), IsDefault = true };
        var cancel = new System.Windows.Controls.Button { Content = "Cancel", Width = 80, Margin = new Thickness(8), IsCancel = true };
        string? result = null;
        ok.Click += (_, _) => { result = box.Text; win.DialogResult = true; };
        cancel.Click += (_, _) => { win.DialogResult = false; };

        var buttons = new StackPanel
        {
            Orientation = System.Windows.Controls.Orientation.Horizontal,
            HorizontalAlignment = System.Windows.HorizontalAlignment.Right,
            Children = { ok, cancel },
        };
        var root = new StackPanel { Margin = new Thickness(8) };
        root.Children.Add(new TextBlock { Text = message, Margin = new Thickness(12, 8, 12, 4) });
        root.Children.Add(box);
        root.Children.Add(buttons);
        win.Content = root;
        return win.ShowDialog() == true ? result : null;
    }
}
