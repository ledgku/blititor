var bcrypt = require('bcrypt');

var moment = require('moment');
var winston = require('winston');

var common = require('../../core/lib/common');
var connection = require('../../core/lib/connection');

var salt = bcrypt.genSaltSync(10);

function findByID(id, callback) {
    var mysql = connection.get();

    var sql = 'select ?? from ?? where `id` = ?';
    var field = ['id', 'uuid', 'nickname', 'photo', 'level', 'grant'];

    mysql.query(sql, [field, 'user', id], function (err, rows) {
        callback(null, rows[0]);
    });
}

function findByUUID(uuid, callback) {
    var mysql = connection.get();

    var sql = 'select ?? from ?? where `uuid` = ?';
    var field = ['id', 'uuid', 'nickname', 'photo', 'level', 'grant', 'created_at', 'updated_at', 'last_logged_at'];

    mysql.query(sql, [field, 'user', uuid], function (err, rows) {
        callback(err, rows[0]);
    });
}

function authByUserID(userID, callback) {
    var mysql = connection.get();

    var sql = 'select ?? from ?? where `user_id` = ?';
    var field = ['id', 'user_id', 'user_password'];

    mysql.query(sql, [field, 'auth', userID], function (err, rows) {
        callback(err, rows[0]);
    });
}

function consumeRememberMeToken(token, fn) {
    var uid = tokens[token];
    // invalidate the single-use token
    delete tokens[token];
    return fn(null, uid);
}

function saveRememberMeToken(token, uid, fn) {
    // tokens[token] = uid;
    return fn();
}

function authenticate(userID, password, done) {
    var hash = bcrypt.hashSync(password, salt);

    authByUserID(userID, function (err, auth) {
        if (err) {
            return done(err);
        }
        if (!auth) {
            return done(null, false, {message: 'Unknown user ' + userID});
        }

        if (bcrypt.compareSync(auth.user_password,hash)) {
            winston.verbose('user given password not exactly same with authorized hash');

            return done(null, false, {message: 'Invalid password'});
        }

        return done(null, auth);
    })
}

function issueToken(user, done) {
    var token = common.randomString(64);
    saveRememberMeToken(token, user.id, function(err) {
        if (err) { return done(err); }
        return done(null, token);
    });
}

function serialize(user, done) {
    winston.verbose('Serialize in ---- process ---- for', user);

    findByID(user.id, function (error, user) {
        done(error, user.uuid);
    });
}

function deserialize(uuid, done) {
    winston.verbose('DeSerialize in ---- process ---- for', uuid);

    findByUUID(uuid, function (err, user) {
        done(err, user);
    });
}


function loginSuccess(req, res, next) {
    winston.verbose('Log in ---- process ---- done');
    // Issue a remember me cookie if the option was checked
    if (!req.body.remember_me) { return next(); }

    issueToken(req.user, function(err, token) {
        winston.info('Issue Cookie Token', token);

        if (err) { return next(err); }
        res.cookie('remember_me', token, { path: '/', httpOnly: true, maxAge: 604800000 });
        return next();
    });
}

function loginDone(req, res) {
    res.redirect('/');
}

function register(req, res) {
    req.assert('nickname', 'screen name is required').len(2, 20).withMessage('Must be between 2 and 10 chars long').notEmpty();
    req.assert('email', 'Email as User ID field is not valid').notEmpty().withMessage('User ID is required').isEmail();
    req.assert('password', 'Password must be at least 4 characters long').len(4);
    req.assert('password_check', 'Password Check must be same as password characters').notEmpty().withMessage('Password Check field is required').equals(req.body.password);

    req.sanitize('nickname').escape();

    var errors = req.validationErrors();

    if (errors) {
        req.flash('error', errors);
        return res.redirect('back');
    }

    var hash = bcrypt.hashSync(req.body.password, salt);

    var authData = {
        user_id: req.body.email,
        user_password: hash
    };

    var mysql = connection.get();

    // save to auth table
    mysql.query('INSERT INTO ?? SET ?', ['auth', authData], function (err, result) {
        if (err) {
            req.flash('error', {msg: '계정 정보 저장에 실패했습니다.'});

            winston.error(error);

            res.redirect('back');
        }

        var auth_id = result['insertId'];

        // save to user table
        var userData = {
            uuid: common.UUID(),
            auth_id: auth_id,
            nickname: req.body.nickname,
            level: 1,
            grant: '',
            login_counter: 1,
            last_logged_at: new Date(),
            created_at: new Date()
        };

        req.flash('info', 'Saved Account by ' + userData.nickname, '(' + authData.user_id + ')');

        mysql.query('insert into ?? SET ?', ['user', userData], function (err, result) {
            if (err) {
                req.flash('error', {msg: '사용자 정보 저장에 실패했습니다.'});

                winston.error(error);

                res.redirect('back');
            }

            var id = result['insertId'];

            var user = {
                id: id,
                uuid: userData.uuid,
                user_id: authData.user_id,
                nickname: userData.nickname,
                level: userData.level,
                grant: userData.grant
            };

            req.logIn(user, function (err) {
                if (err) {
                    req.flash('error', {msg: '로그인 과정에 문제가 발생했습니다.'});

                    winston.error(error);

                    return res.redirect('back');
                }

                res.redirect('/');
            });
        });
    });
}

function showInfo(req, res) {
    var params = {};

    findByUUID(req.user.uuid, function (error, userData) {
        if (error) {
            req.flash('error', {msg: '세션 정보를 찾을 수 없습니다.'});
            return res.redirect('back');
        }

        params.userInfo = userData;
        params.userInfo.created_at = moment(new Date(userData.created_at)).format('LLL');

        res.render(BLITITOR.config.site.theme + '/page/account/info', params);
    });
}

function updateInfo(req, res) {
    var params = {
        updatePassword: false
    };

    console.log(req.body);

    req.assert('nickname', 'screen name is required').len(2, 20).withMessage('Must be between 2 and 10 chars long').notEmpty();

    if (req.body.password && (req.body.password.toString().length >= 4)) {
        req.assert('password', 'Password must be at least 4 characters long').len(4);
        req.assert('password_check', 'Password Check must be same as password characters').notEmpty().withMessage('Password Check field is required').equals(req.body.password);

        params.updatePassword = true;
        params.password = bcrypt.hashSync(req.body.password, salt);
    }

    req.sanitize('nickname').escape();

    var errors = req.validationErrors();

    if (errors) {
        winston.error(errors, errors.length);
        req.flash('error', errors);
        return res.redirect('back');
    }

    var UUID = req.user.uuid;

    if (!UUID) {
        req.flash('error', {msg: 'No Session Info Exist!'});

        return res.redirect('back');
    }

    var userData = {
        nickname: req.body.nickname,
        photo: req.body.profile_image || undefined,
        level: 2,
        grant: 'M',
        updated_at: new Date()
    };

    var mysql = connection.get();

    mysql.query('select ?? from `user` where `uuid` = ?', ['auth_id', UUID], function (err, rows) {
        if (err) {
            winston.error(err);
            req.flash('error', {msg: err});

            return res.redirect('back');
        }

        var authID = rows[0].auth_id;

        // update auth table
        if (params.updatePassword) {
            var authData = {user_password: params.password};

            mysql.query('update `auth` set ? where `id` = ?', [authData, authID], function (err, result) {
                winston.warn('Updated user password into `auth` table record:', result);
            });
        }

        mysql.query('update `user` set ? where `uuid` = ?', [userData, UUID], function (err, result) {
            if (err) {
                winston.error(err);
                req.flash('error', {msg: err});

                return res.redirect('back');
            }

            winston.warn('Updated user info into `user` table record:', result);

            req.flash('info', {msg: '개인 정보가 갱신되었습니다.'});

            return res.redirect('/account/info');
        });
    });
}

module.exports = {
    serialize: serialize,
    deserialize: deserialize,
    authenticate: authenticate,
    loginSuccess: loginSuccess,
    loginDone: loginDone,
    register: register,
    infoForm: showInfo,
    updateInfo: updateInfo,
};