// frontend/src/components/layout/Navbar.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import styles from './Navbar.module.css';

function Navbar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <AppBar position="static">
            <Toolbar>
                <Typography variant="h6" component="div" className={styles.title}>
                    Finance Tool
                </Typography>
                {user && (
                    <Box className={styles.userBox}>
                        <Typography variant="body1">
                            {user.username || user.email}
                        </Typography>
                        <Button
                            color="inherit"
                            onClick={handleLogout}
                            startIcon={<LogoutIcon />}
                        >
                            로그아웃
                        </Button>
                    </Box>
                )}
            </Toolbar>
        </AppBar>
    );
}

export default Navbar;