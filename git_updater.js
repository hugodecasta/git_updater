// -------------------------------------------------------------- IMPORTS

const child_process = require('child_process')
const logger = require('log-to-file')
const fs = require('fs')

// -------------------------------------------------------------- VARS

function log() {
    console.log.apply(console, arguments);
    let str = Array.from(arguments).join(' ')
    logger('[GIT UPDATER] - '+str,'log.log')
    logger(str,__dirname+'/log.log')
}

const map_path = process.argv[2] || './systems.json'

const system_map_check_secs = 10

var sys_map = {}

// -------------------------------------------------------------- PROCESS

let processes = {}

// --------

function start_process(name) {

    log(name,'start')

    let desc = sys_map.process[name]

    processes[name] = null

    let exec_command = desc.exec
    let exec_sp = exec_command.split(' ')
    let process = child_process.spawn(exec_sp[0],exec_sp.slice(1))
    process.on('exit',function(code) {
        log(name,'exit',code)
    })

    processes[name] = process
}

// --------

function setup_repo(name) {

    log(name,'setup')

    let desc = sys_map.repos[name]

    let setups = desc.setup
    for(let com of setups) {
        child_process.execSync(com)
    }
}

// --------

function stop_process(name) {

    if(!(name in processes)) {
        return
    }
    log(name,'kill')

    processes[name].kill('SIGINT')
}

// -------------------------------------------------------------- REPO

let repos = {}
function launch_repo(name) {

    let desc = sys_map.repo[name]

    let git = desc.git
    let dir = desc.dir
    let procs = desc.processes
    let ttp = desc.ttp

    let repo_name = git.split('/')
    repo_name = repo_name[repo_name.length-1]

    let repo_dir = dir+'/'+repo_name

    // --- meths

    function setup_me() {
        setup_repo(name)
    }

    function start_procs() {
        for(let proc of procs) {
            start_process(proc)
        }
    }

    async function is_updated() {
        let updater = child_process.spawn('git',['-C',repo_dir,'pull'])
        let full_data = []
        updater.stdout.on('data', function (data) {
            full_data.push(data.toString())
        });
        return new Promise(ok=>{
            updater.on('exit',function(code) {
                let updated = full_data.length > 1
                if(updated) {
                    log('\n--',git,'updated')
                }
                ok(updated)
            })
        })
    }

    function stop_procs() {
        for(let proc of procs) {
            stop_process(proc)
        }
    }

    // --- clone ?

    if(!fs.existsSync(repo_dir)) {
        log('\ncloning',repo_name)
        child_process.execSync('git clone '+git+' '+repo_dir)
        setup_me()
    }

    // --- procedure

    repos[name] = setInterval(async function() {
        if(await is_updated()) {
            setup_me()
            log(name,"restart !")
            stop_procs()
            start_procs()
        }
    },ttp*1000)
}

function stop_repo(name) {
    clearInterval(repos[name])
}

// -------------------------------------------------------------- CORE

function launch_system() {

    log('-------------------- SYS LAUNCH')

    // --- stop existing proc & repos
    for(let proc in processes) {
        stop_process(proc)
    }
    for(let proc in repos) {
        stop_repo(proc)
    }


    // --- start new proc & repos
    for(let proc in sys_map.process) {
        start_process(proc)
    }
    for(let repo in sys_map.repo) {
        launch_repo(repo)
    }
}

function check_map() {

    if(!fs.existsSync(map_path)) {
        log('Systems map "'+map_path+'" missing')
        process.exit(1)
    }

    let old_map_str = JSON.stringify(sys_map)
    let new_map_str = JSON.stringify(JSON.parse(fs.readFileSync(map_path,'utf8')))

    if(old_map_str != new_map_str) {
        sys_map = JSON.parse(new_map_str)
        launch_system()
    }
}

setInterval(check_map,system_map_check_secs*1000)
check_map()