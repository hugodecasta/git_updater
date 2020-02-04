// -------------------------------------------------------------- IMPORTS

const child_process = require('child_process')
const logger = require('log-to-file')
const fs = require('fs')

// -------------------------------------------------------------- VARS

const map_path = process.argv[2] || './systems.json'
if(!fs.existsSync(map_path)) {
    log('Systems map "'+map_path+'" missing')
    process.exit(1)
}
let sys_map = JSON.parse(fs.readFileSync(map_path,'utf8'))

function log() {
    console.log.apply(console, arguments);
    let str = Array.from(arguments).join(' ')
    logger('[GIT UPDATER] - '+str,'log.log')
    logger(str,__dirname+'log.log')
}

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

function setup_process(name) {

    log(name,'setup')

    let desc = sys_map.process[name]

    let setups = desc.setup_procs
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

function launch_repo(name) {

    let desc = sys_map.repo[name]

    let git = desc.git
    let dir = desc.dir
    let procs = desc.processes

    let repo_name = git.split('/')
    repo_name = repo_name[repo_name.length-1]

    let repo_dir = dir+'/'+repo_name

    // --- meths

    function setup_procs() {
        for(let proc of procs) {
            setup_process(proc)
        }
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
                ok(full_data.length > 1)
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
        log('cloning',repo_name)
        child_process.execSync('git clone '+git+' '+repo_dir)
        setup_procs()
    }

    // --- procedure

    setInterval(async function() {
        if(await is_updated()) {
            log(name,"updated !")
            stop_procs()
            start_procs()
        }
    },5000)
}

// -------------------------------------------------------------- CORE

for(let proc in sys_map.process) {
    start_process(proc)
}

for(let repo in sys_map.repo) {
    launch_repo(repo)
}