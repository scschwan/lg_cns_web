// frontend/src/pages/auth/LoginPage.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Container,
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Alert
} from '@mui/material';
import styles from './LoginPage.module.css';

function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login({ email, password });
            navigate('/projects');
        } catch (err) {
            setError(err.response?.data?.message || '로그인에 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Box className={styles.container}>
                <Paper elevation={3} className={styles.paper}>
                    <Typography component="h1" variant="h4" className={styles.title}>
                        Finance Tool
                    </Typography>
                    <Typography variant="h6" className={styles.subtitle}>
                        로그인
                    </Typography>

                    {error && (
                        <Alert severity="error" className={styles.errorAlert}>
                            {error}
                        </Alert>
                    )}

                    <Box component="form" onSubmit={handleSubmit} className={styles.form}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label="이메일"
                            name="email"
                            autoComplete="email"
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password"
                            label="비밀번호"
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            className={styles.submitButton}
                            disabled={loading}
                        >
                            {loading ? '로그인 중...' : '로그인'}
                        </Button>
                        <Box className={styles.linkBox}>
                            <Link to="/register" className={styles.link}>
                                <Typography variant="body2" color="primary">
                                    계정이 없으신가요? 회원가입
                                </Typography>
                            </Link>
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </Container>
    );
}

export default LoginPage;