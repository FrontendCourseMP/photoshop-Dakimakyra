import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#ff7a18' },
    secondary: { main: '#ff3d81' },
    background: {
      default: '#1a0f14',
      paper: '#26161d',
    },
    text: {
      primary: '#ffe9d6',
      secondary: '#d7acb6',
    },
  },
  typography: {
    fontSize: 13,
  },
  components: {
    MuiButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 10,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: { dense: { minHeight: 48 } },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});
